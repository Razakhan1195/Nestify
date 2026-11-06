-- Apply the existing account-deletion write freeze to the new enquiry store.
create trigger guard_deleting_account before insert or update on public.connected_bill_reviews
 for each row execute function public.guard_deleting_rezlee_account();
create policy connected_review_active_account on public.connected_bill_reviews as restrictive
 for all to authenticated using(public.rezlee_account_active(auth.uid())) with check(public.rezlee_account_active(auth.uid()));
