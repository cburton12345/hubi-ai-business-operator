-- Correct payment-provider deposits that were conservatively misclassified as
-- own-account transfers. A named incoming payer is evidence of money in; rows
-- without payer evidence remain untouched for human review.

update public.document_intelligence_transactions
set is_transfer = false,
    transfer_reason = null,
    status = case
      when status = 'excluded' and posted_expense_ref is null then 'needs_review'
      else status
    end,
    metadata_json = metadata_json || jsonb_build_object(
      'classificationCorrection', 'named_payment_received_deposit_v236'
    ),
    updated_at = now()
where direction = 'credit'
  and is_transfer = true
  and description ~* '\mpayment received\M'
  and (
    nullif(btrim(metadata_json->>'counterpartyName'), '') is not null
    or nullif(btrim(metadata_json->>'counterpartyHandle'), '') is not null
  );

with corrected as (
  select d.id,
  jsonb_agg(
    case
      when item.value->>'description' ~* '\mpayment received\M'
        and (
          nullif(btrim(item.value->>'counterpartyName'), '') is not null
          or nullif(btrim(item.value->>'counterpartyHandle'), '') is not null
        )
      then item.value || jsonb_build_object('isTransfer', false, 'transferReason', null)
      else item.value
    end
    order by item.position
  ) as transactions,
  bool_or(
    item.value->>'description' ~* '\mpayment received\M'
      and (
        nullif(btrim(item.value->>'counterpartyName'), '') is not null
        or nullif(btrim(item.value->>'counterpartyHandle'), '') is not null
      )
      and item.value->'isTransfer' = 'true'::jsonb
  ) as needs_correction
  from public.document_intelligence_documents d
  cross join lateral jsonb_array_elements(d.normalized_json->'statementTransactions')
    with ordinality as item(value, position)
  where d.document_type = 'statement'
    and jsonb_typeof(d.normalized_json->'statementTransactions') = 'array'
  group by d.id
)
update public.document_intelligence_documents d
set normalized_json = jsonb_set(
      d.normalized_json,
      '{statementTransactions}',
      corrected.transactions,
      false
    ),
    updated_at = now()
from corrected
where d.id = corrected.id
  and corrected.needs_correction;
