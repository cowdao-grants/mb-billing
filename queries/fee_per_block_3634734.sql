with 
-- all mempool tx according to flashbots
mempool as (
   SELECT
        distinct(hash)
    FROM dune.flashbots.dataset_mempool_dumpster
    WHERE 
         from_unixtime(cast(timestamp_ms as decimal)/1000)
         >= date_trunc('month', (current_date -interval '8' day)) - interval '1' month
         and from_unixtime(cast(timestamp_ms as decimal)/1000) < date_trunc('month', (current_date -interval '8' day))

)
-- all mev blocker tx that made it on chain
, mev_blocker_tx as (
SELECT from_hex(CAST(json_extract(transactions, '$[0].hash') AS VARCHAR)) as tx_1,
    jt.row_number,
    from_hex(jt.hash) as hash,
    et."from" as tx_from,
    et.index, et.block_number, et.block_time, et.gas_used, et.gas_price
FROM 
    mevblocker.raw_bundles
CROSS JOIN json_table(
    transactions, 
    'lax $[*]' COLUMNS (
        row_number FOR ORDINALITY,
        hash VARCHAR(255) PATH 'lax $.hash'
    )
) AS jt
join ethereum.transactions et
        on from_hex(jt.hash)=et.hash
where 
--jt.hash not in (select hash from mempool) and 
block_time >= date_trunc('month', (current_date -interval '8' day)) - interval '1' month
and block_time < date_trunc('month', (current_date -interval '8' day))
group by 1,2,3,4,5,6,7,8,9
)

-- find last tx in mev blocker bundle 
-- based on the assumption that only the last tx in a bundle can be a searcher transaction
, last_tx_in_bundle as (
    select tx_1, max(row_number) as last_tx_number
    from mev_blocker_tx
    group by 1 
)

-- find which of the last tx in a bundle are not from the same address as the original tx 
-- assume these are searcher tx
, searcher_txs as (
    select m.tx_1, m.hash as search_tx,
    m.index, m.block_number, m.block_time
    from mev_blocker_tx m
    join last_tx_in_bundle l
        on m.tx_1=l.tx_1
    join mev_blocker_tx m2
        on m2.tx_1=m.tx_1
    
    where m.row_number=last_tx_number
        and m2.hash=m2.tx_1
        and m.tx_from!=m2.tx_from
) 

-- assuming that kickbacks immediately after the searcher tx
-- kickback comes from a miner
, possible_kickbacks as (
    select st.block_number, st.index, et."from", to, value, et.hash, et.block_time
    , cast(et.gas_used as UINT256) * (et.gas_price - coalesce(b.base_fee_per_gas, 0))/1e18 as backrun_tip
    from searcher_txs st
    inner join ethereum.transactions et
        on st.block_number = et.block_number
        and st.index + 1 = et.index
    join ethereum.blocks b ON st.block_number = number
    and et."from" = b.miner
    WHERE et.block_time >= date_trunc('month', (current_date -interval '8' day)) - interval '1' month
    and et.block_time < date_trunc('month', (current_date -interval '8' day))
)

,kickbacks as (
select DATE_TRUNC('month',block_time) AS time,
    sum(value/1e18) as kickback_value,
    sum(value) as kickback_value_wei,
    sum(backrun_tip) as backrun_tip
from possible_kickbacks pk
group by 1

)

-- all original (user) transactions, calculating the tip of these transactions
-- excluding transactions that were in the public mempool

,user_tx as (
    select DATE_TRUNC('month',tx.block_time) AS time,
    sum(cast(tx.gas_used as UINT256) * (tx.gas_price - coalesce(b.base_fee_per_gas, 0))/1e18) as user_tip,
    sum(cast(tx.gas_used as UINT256) * (tx.gas_price - coalesce(b.base_fee_per_gas, 0))) as user_tip_wei
    from mev_blocker_tx tx
    LEFT JOIN ethereum.blocks b ON block_number = number
    where tx.hash not in (select search_tx from searcher_txs)
    and cast(tx.hash as varchar) not in (select hash from mempool)
    group by 1

)
  ,miners as (
    select DATE_TRUNC('month',block_time) AS time
        , miner
    from mevblocker.raw_bundles
    inner join ethereum.transactions et
        on from_hex(CAST(json_extract(transactions, '$[0].hash') AS VARCHAR))  = hash
    inner join ethereum.blocks eb on number=block_number
    -- where block_time >= date_trunc('month', current_date) - interval '1' month
    --     and block_time < date_trunc('month', current_date)
    where block_time >= date_trunc('month', (current_date -interval '8' day)) - interval '1' month
    and block_time < date_trunc('month', (current_date -interval '8' day))
    group by 1,2
  )
-- list if miners that signed up for MEV Blocker Flow  - update that from May on
--   ,miners as (
--     select miner_address as miner
--     from query_3665113
--   )
  -- total number of blocks by miners that used mev blocker (in the period)
  , blocks as (
  select DATE_TRUNC('month',date) AS time, count(number) as cnt_blocks
  from ethereum.blocks b
  inner join miners m 
  on b.miner=m.miner 
--   and DATE_TRUNC('month',date) =m.time
  where date >= date_trunc('month', (current_date -interval '8' day)) - interval '1' month
    and date < date_trunc('month', (current_date -interval '8' day))
  group by 1
  )
  
  -- final calculation of the fee per block 
  -- the calculation: 20% of (original_tx_tip + 1/9 of kickback value) / number_of_blocks
  select ut.time, user_tip, k.kickback_value, k.backrun_tip, cnt_blocks,
      cast(0.2 as double)*(user_tip+k.kickback_value/cast(9 as double))/cnt_blocks as avg_block_fee,
      cast(0.2 as double)*(user_tip_wei+k.kickback_value_wei/cast(9 as double))/cnt_blocks as avg_block_fee_wei
  from blocks b
  join user_tx ut on b.time=ut.time
  left join kickbacks k on k.time=b.time
  
  