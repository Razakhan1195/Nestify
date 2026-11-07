-- Use the same deletion lock as all other account-owned records. This also
-- prevents a staff decision or late vote from recreating data during deletion.
create trigger guard_deleting_account before insert or update on public.roadmap_ideas
for each row execute function public.guard_deleting_rezlee_account();
create trigger guard_deleting_account before insert or update on public.roadmap_votes
for each row execute function public.guard_deleting_rezlee_account();
notify pgrst, 'reload schema';
