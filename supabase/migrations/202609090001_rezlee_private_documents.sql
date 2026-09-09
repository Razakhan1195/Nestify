-- Additive: private uploads. No existing records, buckets, or policies are removed.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('rezlee-documents', 'rezlee-documents', false, 10485760,
  array['application/pdf', 'image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

create policy "Rezlee users read their own files" on storage.objects for select to authenticated
using (bucket_id = 'rezlee-documents' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "Rezlee users upload to their own place" on storage.objects for insert to authenticated
with check (bucket_id = 'rezlee-documents' and (storage.foldername(name))[1] = auth.uid()::text
  and exists (select 1 from public.homes h where h.id::text = (storage.foldername(name))[2] and h.user_id = auth.uid()));
create policy "Rezlee users delete their own files" on storage.objects for delete to authenticated
using (bucket_id = 'rezlee-documents' and (storage.foldername(name))[1] = auth.uid()::text);
