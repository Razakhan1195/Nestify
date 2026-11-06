-- Preserve the saved Vault category in the existing authenticated snapshot.
-- Only one selected JSON field is added. Auth checks, ownership and limits stay intact.
DO $migration$
DECLARE definition text;
BEGIN
 SELECT pg_get_functiondef('public.rezlee_mobile_screen_bootstrap(text,boolean)'::regprocedure) INTO definition;
 IF position('select id,title,category,notes,document_type,file_name,storage_path,mime_type,issued_on,expires_on,source,created_at from public.documents' in definition)>0 THEN RETURN; END IF;
 IF position('select id,title,notes,document_type,file_name,storage_path,mime_type,issued_on,expires_on,source,created_at from public.documents' in definition)=0 THEN
  RAISE EXCEPTION 'Vault snapshot shape changed; review this migration before applying';
 END IF;
 EXECUTE replace(definition,'select id,title,notes,document_type,file_name,storage_path,mime_type,issued_on,expires_on,source,created_at from public.documents','select id,title,category,notes,document_type,file_name,storage_path,mime_type,issued_on,expires_on,source,created_at from public.documents');
END
$migration$;
