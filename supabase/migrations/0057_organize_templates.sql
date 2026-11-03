-- =============================================================================
-- Kinus — 0057: Print → Templates sorted into folders (a one-off tidy of this camp's
--   templates, by their ids: on another database it changes nothing). Each folder lists
--   American, then Hebrew, then French; the check-in name tags come before the bag labels,
--   so printed as sets each camper's name tag still comes first. Two names get the same
--   dash as the others. Logged in the activity log as "organize".
-- =============================================================================
select set_config('kinus.audit_source', 'organize', true);

update print_templates set folder = 'Check-in labels (thermal 50×80)', sort_order = 10, name = 'Name Tag 50×80 (thermal) – American' where id = 'eec98cf5-6c9d-4011-af40-e968bb883387';
update print_templates set folder = 'Check-in labels (thermal 50×80)', sort_order = 20 where id = '1ed4591e-63d3-43c4-a5bc-1122290f662d';
update print_templates set folder = 'Check-in labels (thermal 50×80)', sort_order = 30 where id = '71dade6c-4d4b-4b2a-8f59-d1975225ecd8';
update print_templates set folder = 'Check-in labels (thermal 50×80)', sort_order = 40, name = 'Bag Label 50×80 fold (thermal) – American' where id = 'a4d682c2-0b26-4861-bdb5-23a0990d23b0';
update print_templates set folder = 'Check-in labels (thermal 50×80)', sort_order = 50 where id = '858eed2b-c8ac-411b-a859-5f0bd05592fa';
update print_templates set folder = 'Check-in labels (thermal 50×80)', sort_order = 60 where id = 'ff485a8e-63e0-46bd-831d-71a871c03193';
update print_templates set folder = 'Name badges', sort_order = 70 where id = 'c799f212-59b3-4e6e-9273-d969e65ad51c';
update print_templates set folder = 'Name badges', sort_order = 80 where id = '3ba04bd4-2c24-44a0-860b-f28129a6d1bc';
update print_templates set folder = 'Name badges', sort_order = 90 where id = 'c74370db-3dc7-4c8f-9d82-9fd7b9dcd14f';
update print_templates set folder = 'Name badges', sort_order = 100 where id = 'b9269ba6-f052-41bd-93bb-65cc5c2c899f';
update print_templates set folder = 'Luggage tags', sort_order = 110 where id = 'a7860c54-63ae-4c70-a315-d87b0a6c8b1d';
update print_templates set folder = 'Luggage tags', sort_order = 120 where id = 'bc3c0c13-08b8-4f99-9812-e70410350f48';
update print_templates set folder = 'Luggage tags', sort_order = 130 where id = 'b6edfd7f-6faa-4cfa-b58d-e76359340437';
update print_templates set folder = 'Coat tags', sort_order = 140 where id = 'bfa5e0e1-a51f-4497-a498-32a95ae0c6bf';
update print_templates set folder = 'Coat tags', sort_order = 150 where id = '90f1ee8c-9d07-4148-a9a2-c5aa99d6d59a';
update print_templates set folder = 'Coat tags', sort_order = 160 where id = 'a358fd1c-2cc7-47c2-a110-996a8beb8e92';
update print_templates set folder = 'Packing labels (4×6)', sort_order = 170 where id = '13a06d02-0dd7-47ef-9b72-fdfbf530178d';
update print_templates set folder = 'Packing labels (4×6)', sort_order = 180 where id = '845d2631-4a3e-4727-b3b3-6a79fda9aee9';
update print_templates set folder = 'Packing labels (4×6)', sort_order = 190 where id = '375866ae-a331-477f-b464-10b372da6a11';
update print_templates set folder = 'Other labels', sort_order = 200 where id = '0d670336-a04e-46bf-8029-4a7ca108948b';
update print_templates set folder = 'Other labels', sort_order = 210 where id = 'e8d4037b-a90c-4d29-aea3-7dc5b1337480';
update print_templates set folder = 'Staff', sort_order = 220 where id = '3ecd4678-12a4-48fe-aae3-5ceed7fbf7ae';
update print_templates set folder = 'Staff', sort_order = 230 where id = 'b82e75c7-18ab-4c74-b5ff-a4aa1bd211c3';
