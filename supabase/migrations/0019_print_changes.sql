-- What each printed label said (a fingerprint of the camper's values for the fields the
-- template uses), so a batch can print only new campers and labels whose details changed.
alter table print_job_items add column if not exists content_hash text;
create index if not exists print_job_items_camper_idx on print_job_items (camper_id);
