-- The 4×6 luggage labels are printed by the office in batches; as one-tap buttons on every
-- camper card they crowd a counselor's phone. Take them off the card (a director can put
-- them back in the template's settings). Only touches them if nobody changed it yet.
update print_templates set show_on_card = false
 where id in ('d0000000-0000-0000-0000-000000000003', 'd0000000-0000-0000-0000-000000000004')
   and show_on_card;
