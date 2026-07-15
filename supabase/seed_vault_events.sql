-- Seed vault_events: currently-vaulted Prime Access items.
-- Source: Warframe wiki Prime Vault page (as of mid-2025).
-- Run once after at least one sweep has populated prime_items.
-- Safe to re-run: skips items that already have a vault event.

-- Helper: insert a 'vaulted' event for every part of a Prime Access set,
-- matched by url_name prefix. Only inserts if the item exists in prime_items
-- and doesn't already have a vault event.

-- Frost Prime (vaulted 2015-09-29)
INSERT INTO vault_events (item_id, event, effective_date)
SELECT id, 'vaulted', '2015-09-29' FROM prime_items
WHERE url_name LIKE 'frost_prime%' AND ducats IS NOT NULL
AND id NOT IN (SELECT item_id FROM vault_events)
ON CONFLICT DO NOTHING;

-- Mag Prime (vaulted 2015-09-29)
INSERT INTO vault_events (item_id, event, effective_date)
SELECT id, 'vaulted', '2015-09-29' FROM prime_items
WHERE url_name LIKE 'mag_prime%' AND ducats IS NOT NULL
AND id NOT IN (SELECT item_id FROM vault_events)
ON CONFLICT DO NOTHING;

-- Ember Prime (vaulted 2016-06-28)
INSERT INTO vault_events (item_id, event, effective_date)
SELECT id, 'vaulted', '2016-06-28' FROM prime_items
WHERE url_name LIKE 'ember_prime%' AND ducats IS NOT NULL
AND id NOT IN (SELECT item_id FROM vault_events)
ON CONFLICT DO NOTHING;

-- Rhino Prime (vaulted 2016-08-23)
INSERT INTO vault_events (item_id, event, effective_date)
SELECT id, 'vaulted', '2016-08-23' FROM prime_items
WHERE url_name LIKE 'rhino_prime%' AND ducats IS NOT NULL
AND id NOT IN (SELECT item_id FROM vault_events)
ON CONFLICT DO NOTHING;

-- Loki Prime (vaulted 2017-01-25)
INSERT INTO vault_events (item_id, event, effective_date)
SELECT id, 'vaulted', '2017-01-25' FROM prime_items
WHERE url_name LIKE 'loki_prime%' AND ducats IS NOT NULL
AND id NOT IN (SELECT item_id FROM vault_events)
ON CONFLICT DO NOTHING;

-- Nyx Prime (vaulted 2017-06-06)
INSERT INTO vault_events (item_id, event, effective_date)
SELECT id, 'vaulted', '2017-06-06' FROM prime_items
WHERE url_name LIKE 'nyx_prime%' AND ducats IS NOT NULL
AND id NOT IN (SELECT item_id FROM vault_events)
ON CONFLICT DO NOTHING;

-- Nova Prime (vaulted 2017-10-10)
INSERT INTO vault_events (item_id, event, effective_date)
SELECT id, 'vaulted', '2017-10-10' FROM prime_items
WHERE url_name LIKE 'nova_prime%' AND ducats IS NOT NULL
AND id NOT IN (SELECT item_id FROM vault_events)
ON CONFLICT DO NOTHING;

-- Volt Prime (vaulted 2017-12-12)
INSERT INTO vault_events (item_id, event, effective_date)
SELECT id, 'vaulted', '2017-12-12' FROM prime_items
WHERE url_name LIKE 'volt_prime%' AND ducats IS NOT NULL
AND id NOT IN (SELECT item_id FROM vault_events)
ON CONFLICT DO NOTHING;

-- Ash Prime (vaulted 2018-02-06)
INSERT INTO vault_events (item_id, event, effective_date)
SELECT id, 'vaulted', '2018-02-06' FROM prime_items
WHERE url_name LIKE 'ash_prime%' AND ducats IS NOT NULL
AND id NOT IN (SELECT item_id FROM vault_events)
ON CONFLICT DO NOTHING;

-- Trinity Prime (vaulted 2018-06-05)
INSERT INTO vault_events (item_id, event, effective_date)
SELECT id, 'vaulted', '2018-06-05' FROM prime_items
WHERE url_name LIKE 'trinity_prime%' AND ducats IS NOT NULL
AND id NOT IN (SELECT item_id FROM vault_events)
ON CONFLICT DO NOTHING;

-- Saryn Prime (vaulted 2018-09-25)
INSERT INTO vault_events (item_id, event, effective_date)
SELECT id, 'vaulted', '2018-09-25' FROM prime_items
WHERE url_name LIKE 'saryn_prime%' AND ducats IS NOT NULL
AND id NOT IN (SELECT item_id FROM vault_events)
ON CONFLICT DO NOTHING;

-- Vauban Prime (vaulted 2019-01-15)
INSERT INTO vault_events (item_id, event, effective_date)
SELECT id, 'vaulted', '2019-01-15' FROM prime_items
WHERE url_name LIKE 'vauban_prime%' AND ducats IS NOT NULL
AND id NOT IN (SELECT item_id FROM vault_events)
ON CONFLICT DO NOTHING;

-- Nekros Prime (vaulted 2019-03-26)
INSERT INTO vault_events (item_id, event, effective_date)
SELECT id, 'vaulted', '2019-03-26' FROM prime_items
WHERE url_name LIKE 'nekros_prime%' AND ducats IS NOT NULL
AND id NOT IN (SELECT item_id FROM vault_events)
ON CONFLICT DO NOTHING;

-- Valkyr Prime (vaulted 2019-06-18)
INSERT INTO vault_events (item_id, event, effective_date)
SELECT id, 'vaulted', '2019-06-18' FROM prime_items
WHERE url_name LIKE 'valkyr_prime%' AND ducats IS NOT NULL
AND id NOT IN (SELECT item_id FROM vault_events)
ON CONFLICT DO NOTHING;

-- Banshee Prime (vaulted 2019-09-17)
INSERT INTO vault_events (item_id, event, effective_date)
SELECT id, 'vaulted', '2019-09-17' FROM prime_items
WHERE url_name LIKE 'banshee_prime%' AND ducats IS NOT NULL
AND id NOT IN (SELECT item_id FROM vault_events)
ON CONFLICT DO NOTHING;

-- Oberon Prime (vaulted 2020-01-28)
INSERT INTO vault_events (item_id, event, effective_date)
SELECT id, 'vaulted', '2020-01-28' FROM prime_items
WHERE url_name LIKE 'oberon_prime%' AND ducats IS NOT NULL
AND id NOT IN (SELECT item_id FROM vault_events)
ON CONFLICT DO NOTHING;

-- Hydroid Prime (vaulted 2020-04-28)
INSERT INTO vault_events (item_id, event, effective_date)
SELECT id, 'vaulted', '2020-04-28' FROM prime_items
WHERE url_name LIKE 'hydroid_prime%' AND ducats IS NOT NULL
AND id NOT IN (SELECT item_id FROM vault_events)
ON CONFLICT DO NOTHING;

-- Mirage Prime (vaulted 2020-07-14)
INSERT INTO vault_events (item_id, event, effective_date)
SELECT id, 'vaulted', '2020-07-14' FROM prime_items
WHERE url_name LIKE 'mirage_prime%' AND ducats IS NOT NULL
AND id NOT IN (SELECT item_id FROM vault_events)
ON CONFLICT DO NOTHING;

-- Zephyr Prime (vaulted 2020-10-06)
INSERT INTO vault_events (item_id, event, effective_date)
SELECT id, 'vaulted', '2020-10-06' FROM prime_items
WHERE url_name LIKE 'zephyr_prime%' AND ducats IS NOT NULL
AND id NOT IN (SELECT item_id FROM vault_events)
ON CONFLICT DO NOTHING;

-- Limbo Prime (vaulted 2021-01-26)
INSERT INTO vault_events (item_id, event, effective_date)
SELECT id, 'vaulted', '2021-01-26' FROM prime_items
WHERE url_name LIKE 'limbo_prime%' AND ducats IS NOT NULL
AND id NOT IN (SELECT item_id FROM vault_events)
ON CONFLICT DO NOTHING;

-- Chroma Prime (vaulted 2021-03-30)
INSERT INTO vault_events (item_id, event, effective_date)
SELECT id, 'vaulted', '2021-03-30' FROM prime_items
WHERE url_name LIKE 'chroma_prime%' AND ducats IS NOT NULL
AND id NOT IN (SELECT item_id FROM vault_events)
ON CONFLICT DO NOTHING;

-- Mesa Prime (vaulted 2021-06-29)
INSERT INTO vault_events (item_id, event, effective_date)
SELECT id, 'vaulted', '2021-06-29' FROM prime_items
WHERE url_name LIKE 'mesa_prime%' AND ducats IS NOT NULL
AND id NOT IN (SELECT item_id FROM vault_events)
ON CONFLICT DO NOTHING;

-- Equinox Prime (vaulted 2021-09-28)
INSERT INTO vault_events (item_id, event, effective_date)
SELECT id, 'vaulted', '2021-09-28' FROM prime_items
WHERE url_name LIKE 'equinox_prime%' AND ducats IS NOT NULL
AND id NOT IN (SELECT item_id FROM vault_events)
ON CONFLICT DO NOTHING;

-- Atlas Prime (vaulted 2021-12-15)
INSERT INTO vault_events (item_id, event, effective_date)
SELECT id, 'vaulted', '2021-12-15' FROM prime_items
WHERE url_name LIKE 'atlas_prime%' AND ducats IS NOT NULL
AND id NOT IN (SELECT item_id FROM vault_events)
ON CONFLICT DO NOTHING;

-- Wukong Prime (vaulted 2022-03-16)
INSERT INTO vault_events (item_id, event, effective_date)
SELECT id, 'vaulted', '2022-03-16' FROM prime_items
WHERE url_name LIKE 'wukong_prime%' AND ducats IS NOT NULL
AND id NOT IN (SELECT item_id FROM vault_events)
ON CONFLICT DO NOTHING;

-- Ivara Prime (vaulted 2022-06-09)
INSERT INTO vault_events (item_id, event, effective_date)
SELECT id, 'vaulted', '2022-06-09' FROM prime_items
WHERE url_name LIKE 'ivara_prime%' AND ducats IS NOT NULL
AND id NOT IN (SELECT item_id FROM vault_events)
ON CONFLICT DO NOTHING;

-- Titania Prime (vaulted 2022-09-07)
INSERT INTO vault_events (item_id, event, effective_date)
SELECT id, 'vaulted', '2022-09-07' FROM prime_items
WHERE url_name LIKE 'titania_prime%' AND ducats IS NOT NULL
AND id NOT IN (SELECT item_id FROM vault_events)
ON CONFLICT DO NOTHING;

-- Inaros Prime (vaulted 2022-12-07)
INSERT INTO vault_events (item_id, event, effective_date)
SELECT id, 'vaulted', '2022-12-07' FROM prime_items
WHERE url_name LIKE 'inaros_prime%' AND ducats IS NOT NULL
AND id NOT IN (SELECT item_id FROM vault_events)
ON CONFLICT DO NOTHING;

-- Nezha Prime (vaulted 2023-03-15)
INSERT INTO vault_events (item_id, event, effective_date)
SELECT id, 'vaulted', '2023-03-15' FROM prime_items
WHERE url_name LIKE 'nezha_prime%' AND ducats IS NOT NULL
AND id NOT IN (SELECT item_id FROM vault_events)
ON CONFLICT DO NOTHING;

-- Octavia Prime (vaulted 2023-06-21)
INSERT INTO vault_events (item_id, event, effective_date)
SELECT id, 'vaulted', '2023-06-21' FROM prime_items
WHERE url_name LIKE 'octavia_prime%' AND ducats IS NOT NULL
AND id NOT IN (SELECT item_id FROM vault_events)
ON CONFLICT DO NOTHING;

-- Gara Prime (vaulted 2023-09-13)
INSERT INTO vault_events (item_id, event, effective_date)
SELECT id, 'vaulted', '2023-09-13' FROM prime_items
WHERE url_name LIKE 'gara_prime%' AND ducats IS NOT NULL
AND id NOT IN (SELECT item_id FROM vault_events)
ON CONFLICT DO NOTHING;

-- Nidus Prime (vaulted 2023-12-13)
INSERT INTO vault_events (item_id, event, effective_date)
SELECT id, 'vaulted', '2023-12-13' FROM prime_items
WHERE url_name LIKE 'nidus_prime%' AND ducats IS NOT NULL
AND id NOT IN (SELECT item_id FROM vault_events)
ON CONFLICT DO NOTHING;

-- Harrow Prime (vaulted 2024-03-27)
INSERT INTO vault_events (item_id, event, effective_date)
SELECT id, 'vaulted', '2024-03-27' FROM prime_items
WHERE url_name LIKE 'harrow_prime%' AND ducats IS NOT NULL
AND id NOT IN (SELECT item_id FROM vault_events)
ON CONFLICT DO NOTHING;

-- Garuda Prime (vaulted 2024-06-18)
INSERT INTO vault_events (item_id, event, effective_date)
SELECT id, 'vaulted', '2024-06-18' FROM prime_items
WHERE url_name LIKE 'garuda_prime%' AND ducats IS NOT NULL
AND id NOT IN (SELECT item_id FROM vault_events)
ON CONFLICT DO NOTHING;

-- Revenant Prime (vaulted 2024-09-18)
INSERT INTO vault_events (item_id, event, effective_date)
SELECT id, 'vaulted', '2024-09-18' FROM prime_items
WHERE url_name LIKE 'revenant_prime%' AND ducats IS NOT NULL
AND id NOT IN (SELECT item_id FROM vault_events)
ON CONFLICT DO NOTHING;

-- Baruuk Prime (vaulted 2024-12-18)
INSERT INTO vault_events (item_id, event, effective_date)
SELECT id, 'vaulted', '2024-12-18' FROM prime_items
WHERE url_name LIKE 'baruuk_prime%' AND ducats IS NOT NULL
AND id NOT IN (SELECT item_id FROM vault_events)
ON CONFLICT DO NOTHING;

-- Hildryn Prime (vaulted 2025-03-18)
INSERT INTO vault_events (item_id, event, effective_date)
SELECT id, 'vaulted', '2025-03-18' FROM prime_items
WHERE url_name LIKE 'hildryn_prime%' AND ducats IS NOT NULL
AND id NOT IN (SELECT item_id FROM vault_events)
ON CONFLICT DO NOTHING;

-- Also mark associated Prime weapons for these frames.
-- Weapons are matched by their own url_name patterns.

-- Latron Prime & Reaper Prime (Frost PA)
INSERT INTO vault_events (item_id, event, effective_date)
SELECT id, 'vaulted', '2015-09-29' FROM prime_items
WHERE (url_name LIKE 'latron_prime%' OR url_name LIKE 'reaper_prime%') AND ducats IS NOT NULL
AND id NOT IN (SELECT item_id FROM vault_events)
ON CONFLICT DO NOTHING;

-- Boar Prime & Dakra Prime (Mag PA)
INSERT INTO vault_events (item_id, event, effective_date)
SELECT id, 'vaulted', '2015-09-29' FROM prime_items
WHERE (url_name LIKE 'boar_prime%' OR url_name LIKE 'dakra_prime%') AND ducats IS NOT NULL
AND id NOT IN (SELECT item_id FROM vault_events)
ON CONFLICT DO NOTHING;

-- Sicarus Prime & Glaive Prime (Ember PA)
INSERT INTO vault_events (item_id, event, effective_date)
SELECT id, 'vaulted', '2016-06-28' FROM prime_items
WHERE (url_name LIKE 'sicarus_prime%' OR url_name LIKE 'glaive_prime%') AND ducats IS NOT NULL
AND id NOT IN (SELECT item_id FROM vault_events)
ON CONFLICT DO NOTHING;

-- Boltor Prime & Ankyros Prime (Rhino PA)
INSERT INTO vault_events (item_id, event, effective_date)
SELECT id, 'vaulted', '2016-08-23' FROM prime_items
WHERE (url_name LIKE 'boltor_prime%' OR url_name LIKE 'ankyros_prime%') AND ducats IS NOT NULL
AND id NOT IN (SELECT item_id FROM vault_events)
ON CONFLICT DO NOTHING;

-- Bo Prime & Wyrm Prime (Loki PA)
INSERT INTO vault_events (item_id, event, effective_date)
SELECT id, 'vaulted', '2017-01-25' FROM prime_items
WHERE (url_name LIKE 'bo_prime%' OR url_name LIKE 'wyrm_prime%') AND ducats IS NOT NULL
AND id NOT IN (SELECT item_id FROM vault_events)
ON CONFLICT DO NOTHING;

-- Hikou Prime & Scindo Prime (Nyx PA)
INSERT INTO vault_events (item_id, event, effective_date)
SELECT id, 'vaulted', '2017-06-06' FROM prime_items
WHERE (url_name LIKE 'hikou_prime%' OR url_name LIKE 'scindo_prime%') AND ducats IS NOT NULL
AND id NOT IN (SELECT item_id FROM vault_events)
ON CONFLICT DO NOTHING;

-- Soma Prime & Vasto Prime (Nova PA)
INSERT INTO vault_events (item_id, event, effective_date)
SELECT id, 'vaulted', '2017-10-10' FROM prime_items
WHERE (url_name LIKE 'soma_prime%' OR url_name LIKE 'vasto_prime%') AND ducats IS NOT NULL
AND id NOT IN (SELECT item_id FROM vault_events)
ON CONFLICT DO NOTHING;

-- Odonata Prime (Volt PA)
INSERT INTO vault_events (item_id, event, effective_date)
SELECT id, 'vaulted', '2017-12-12' FROM prime_items
WHERE url_name LIKE 'odonata_prime%' AND ducats IS NOT NULL
AND id NOT IN (SELECT item_id FROM vault_events)
ON CONFLICT DO NOTHING;

-- Vectis Prime & Carrier Prime (Ash PA)
INSERT INTO vault_events (item_id, event, effective_date)
SELECT id, 'vaulted', '2018-02-06' FROM prime_items
WHERE (url_name LIKE 'vectis_prime%' OR url_name LIKE 'carrier_prime%') AND ducats IS NOT NULL
AND id NOT IN (SELECT item_id FROM vault_events)
ON CONFLICT DO NOTHING;

-- Kavasa Prime & Dual Kamas Prime (Trinity PA)
INSERT INTO vault_events (item_id, event, effective_date)
SELECT id, 'vaulted', '2018-06-05' FROM prime_items
WHERE (url_name LIKE 'kavasa_prime%' OR url_name LIKE 'dual_kamas_prime%') AND ducats IS NOT NULL
AND id NOT IN (SELECT item_id FROM vault_events)
ON CONFLICT DO NOTHING;

-- Nikana Prime & Spira Prime (Saryn PA)
INSERT INTO vault_events (item_id, event, effective_date)
SELECT id, 'vaulted', '2018-09-25' FROM prime_items
WHERE (url_name LIKE 'nikana_prime%' OR url_name LIKE 'spira_prime%') AND ducats IS NOT NULL
AND id NOT IN (SELECT item_id FROM vault_events)
ON CONFLICT DO NOTHING;

-- Fragor Prime & Akstiletto Prime (Vauban PA)
INSERT INTO vault_events (item_id, event, effective_date)
SELECT id, 'vaulted', '2019-01-15' FROM prime_items
WHERE (url_name LIKE 'fragor_prime%' OR url_name LIKE 'akstiletto_prime%') AND ducats IS NOT NULL
AND id NOT IN (SELECT item_id FROM vault_events)
ON CONFLICT DO NOTHING;

-- Tigris Prime & Galatine Prime (Nekros PA)
INSERT INTO vault_events (item_id, event, effective_date)
SELECT id, 'vaulted', '2019-03-26' FROM prime_items
WHERE (url_name LIKE 'tigris_prime%' OR url_name LIKE 'galatine_prime%') AND ducats IS NOT NULL
AND id NOT IN (SELECT item_id FROM vault_events)
ON CONFLICT DO NOTHING;

-- Cernos Prime & Venka Prime (Valkyr PA)
INSERT INTO vault_events (item_id, event, effective_date)
SELECT id, 'vaulted', '2019-06-18' FROM prime_items
WHERE (url_name LIKE 'cernos_prime%' OR url_name LIKE 'venka_prime%') AND ducats IS NOT NULL
AND id NOT IN (SELECT item_id FROM vault_events)
ON CONFLICT DO NOTHING;

-- Euphona Prime & Helios Prime (Banshee PA)
INSERT INTO vault_events (item_id, event, effective_date)
SELECT id, 'vaulted', '2019-09-17' FROM prime_items
WHERE (url_name LIKE 'euphona_prime%' OR url_name LIKE 'helios_prime%') AND ducats IS NOT NULL
AND id NOT IN (SELECT item_id FROM vault_events)
ON CONFLICT DO NOTHING;

-- Sybaris Prime & Silva_and_aegis Prime (Oberon PA)
INSERT INTO vault_events (item_id, event, effective_date)
SELECT id, 'vaulted', '2020-01-28' FROM prime_items
WHERE (url_name LIKE 'sybaris_prime%' OR url_name LIKE 'silva_%aegis_prime%') AND ducats IS NOT NULL
AND id NOT IN (SELECT item_id FROM vault_events)
ON CONFLICT DO NOTHING;

-- Ballistica Prime & Nami Skyla Prime (Hydroid PA)
INSERT INTO vault_events (item_id, event, effective_date)
SELECT id, 'vaulted', '2020-04-28' FROM prime_items
WHERE (url_name LIKE 'ballistica_prime%' OR url_name LIKE 'nami_skyla_prime%') AND ducats IS NOT NULL
AND id NOT IN (SELECT item_id FROM vault_events)
ON CONFLICT DO NOTHING;

-- Akbolto Prime & Kogake Prime (Mirage PA)
INSERT INTO vault_events (item_id, event, effective_date)
SELECT id, 'vaulted', '2020-07-14' FROM prime_items
WHERE (url_name LIKE 'akbolto_prime%' OR url_name LIKE 'kogake_prime%') AND ducats IS NOT NULL
AND id NOT IN (SELECT item_id FROM vault_events)
ON CONFLICT DO NOTHING;

-- Tiberon Prime & Kronen Prime (Zephyr PA)
INSERT INTO vault_events (item_id, event, effective_date)
SELECT id, 'vaulted', '2020-10-06' FROM prime_items
WHERE (url_name LIKE 'tiberon_prime%' OR url_name LIKE 'kronen_prime%') AND ducats IS NOT NULL
AND id NOT IN (SELECT item_id FROM vault_events)
ON CONFLICT DO NOTHING;

-- Pyrana Prime & Destreza Prime (Limbo PA)
INSERT INTO vault_events (item_id, event, effective_date)
SELECT id, 'vaulted', '2021-01-26' FROM prime_items
WHERE (url_name LIKE 'pyrana_prime%' OR url_name LIKE 'destreza_prime%') AND ducats IS NOT NULL
AND id NOT IN (SELECT item_id FROM vault_events)
ON CONFLICT DO NOTHING;

-- Rubico Prime & Gram Prime (Chroma PA)
INSERT INTO vault_events (item_id, event, effective_date)
SELECT id, 'vaulted', '2021-03-30' FROM prime_items
WHERE (url_name LIKE 'rubico_prime%' OR url_name LIKE 'gram_prime%') AND ducats IS NOT NULL
AND id NOT IN (SELECT item_id FROM vault_events)
ON CONFLICT DO NOTHING;

-- Akjagara Prime & Redeemer Prime (Mesa PA)
INSERT INTO vault_events (item_id, event, effective_date)
SELECT id, 'vaulted', '2021-06-29' FROM prime_items
WHERE (url_name LIKE 'akjagara_prime%' OR url_name LIKE 'redeemer_prime%') AND ducats IS NOT NULL
AND id NOT IN (SELECT item_id FROM vault_events)
ON CONFLICT DO NOTHING;

-- Tipedo Prime & Stradavar Prime (Equinox PA)
INSERT INTO vault_events (item_id, event, effective_date)
SELECT id, 'vaulted', '2021-09-28' FROM prime_items
WHERE (url_name LIKE 'tipedo_prime%' OR url_name LIKE 'stradavar_prime%') AND ducats IS NOT NULL
AND id NOT IN (SELECT item_id FROM vault_events)
ON CONFLICT DO NOTHING;

-- Tekko Prime & Dethcube Prime (Atlas PA)
INSERT INTO vault_events (item_id, event, effective_date)
SELECT id, 'vaulted', '2021-12-15' FROM prime_items
WHERE (url_name LIKE 'tekko_prime%' OR url_name LIKE 'dethcube_prime%') AND ducats IS NOT NULL
AND id NOT IN (SELECT item_id FROM vault_events)
ON CONFLICT DO NOTHING;

-- Zhuge Prime & Ninkondi Prime (Wukong PA)
INSERT INTO vault_events (item_id, event, effective_date)
SELECT id, 'vaulted', '2022-03-16' FROM prime_items
WHERE (url_name LIKE 'zhuge_prime%' OR url_name LIKE 'ninkondi_prime%') AND ducats IS NOT NULL
AND id NOT IN (SELECT item_id FROM vault_events)
ON CONFLICT DO NOTHING;

-- Baza Prime & Aksomati Prime (Ivara PA)
INSERT INTO vault_events (item_id, event, effective_date)
SELECT id, 'vaulted', '2022-06-09' FROM prime_items
WHERE (url_name LIKE 'baza_prime%' OR url_name LIKE 'aksomati_prime%') AND ducats IS NOT NULL
AND id NOT IN (SELECT item_id FROM vault_events)
ON CONFLICT DO NOTHING;

-- Corinth Prime & Pangolin Prime (Titania PA)
INSERT INTO vault_events (item_id, event, effective_date)
SELECT id, 'vaulted', '2022-09-07' FROM prime_items
WHERE (url_name LIKE 'corinth_prime%' OR url_name LIKE 'pangolin_prime%') AND ducats IS NOT NULL
AND id NOT IN (SELECT item_id FROM vault_events)
ON CONFLICT DO NOTHING;

-- Panthera Prime & Karyst Prime (Inaros PA)
INSERT INTO vault_events (item_id, event, effective_date)
SELECT id, 'vaulted', '2022-12-07' FROM prime_items
WHERE (url_name LIKE 'panthera_prime%' OR url_name LIKE 'karyst_prime%') AND ducats IS NOT NULL
AND id NOT IN (SELECT item_id FROM vault_events)
ON CONFLICT DO NOTHING;

-- Zakti Prime & Guandao Prime (Nezha PA)
INSERT INTO vault_events (item_id, event, effective_date)
SELECT id, 'vaulted', '2023-03-15' FROM prime_items
WHERE (url_name LIKE 'zakti_prime%' OR url_name LIKE 'guandao_prime%') AND ducats IS NOT NULL
AND id NOT IN (SELECT item_id FROM vault_events)
ON CONFLICT DO NOTHING;

-- Tenora Prime & Pandero Prime (Octavia PA)
INSERT INTO vault_events (item_id, event, effective_date)
SELECT id, 'vaulted', '2023-06-21' FROM prime_items
WHERE (url_name LIKE 'tenora_prime%' OR url_name LIKE 'pandero_prime%') AND ducats IS NOT NULL
AND id NOT IN (SELECT item_id FROM vault_events)
ON CONFLICT DO NOTHING;

-- Astilla Prime & Volnus Prime (Gara PA)
INSERT INTO vault_events (item_id, event, effective_date)
SELECT id, 'vaulted', '2023-09-13' FROM prime_items
WHERE (url_name LIKE 'astilla_prime%' OR url_name LIKE 'volnus_prime%') AND ducats IS NOT NULL
AND id NOT IN (SELECT item_id FROM vault_events)
ON CONFLICT DO NOTHING;

-- Magnus Prime & Strun Prime (Nidus PA)
INSERT INTO vault_events (item_id, event, effective_date)
SELECT id, 'vaulted', '2023-12-13' FROM prime_items
WHERE (url_name LIKE 'magnus_prime%' OR url_name LIKE 'strun_prime%') AND ducats IS NOT NULL
AND id NOT IN (SELECT item_id FROM vault_events)
ON CONFLICT DO NOTHING;

-- Knell Prime & Scourge Prime (Harrow PA)
INSERT INTO vault_events (item_id, event, effective_date)
SELECT id, 'vaulted', '2024-03-27' FROM prime_items
WHERE (url_name LIKE 'knell_prime%' OR url_name LIKE 'scourge_prime%') AND ducats IS NOT NULL
AND id NOT IN (SELECT item_id FROM vault_events)
ON CONFLICT DO NOTHING;

-- Nagantaka Prime & Corvas Prime (Garuda PA)
INSERT INTO vault_events (item_id, event, effective_date)
SELECT id, 'vaulted', '2024-06-18' FROM prime_items
WHERE (url_name LIKE 'nagantaka_prime%' OR url_name LIKE 'corvas_prime%') AND ducats IS NOT NULL
AND id NOT IN (SELECT item_id FROM vault_events)
ON CONFLICT DO NOTHING;

-- Phantasma Prime & Tatsu Prime (Revenant PA)
INSERT INTO vault_events (item_id, event, effective_date)
SELECT id, 'vaulted', '2024-09-18' FROM prime_items
WHERE (url_name LIKE 'phantasma_prime%' OR url_name LIKE 'tatsu_prime%') AND ducats IS NOT NULL
AND id NOT IN (SELECT item_id FROM vault_events)
ON CONFLICT DO NOTHING;

-- Cobra_and_crane Prime & Akarius Prime (Baruuk PA)
INSERT INTO vault_events (item_id, event, effective_date)
SELECT id, 'vaulted', '2024-12-18' FROM prime_items
WHERE (url_name LIKE 'cobra_%crane_prime%' OR url_name LIKE 'akarius_prime%') AND ducats IS NOT NULL
AND id NOT IN (SELECT item_id FROM vault_events)
ON CONFLICT DO NOTHING;

-- Larkspur Prime & Shade Prime (Hildryn PA)
INSERT INTO vault_events (item_id, event, effective_date)
SELECT id, 'vaulted', '2025-03-18' FROM prime_items
WHERE (url_name LIKE 'larkspur_prime%' OR url_name LIKE 'shade_prime%') AND ducats IS NOT NULL
AND id NOT IN (SELECT item_id FROM vault_events)
ON CONFLICT DO NOTHING;

-- Also update vaulted flag on prime_items for all items that got vault events
UPDATE prime_items SET vaulted = true
WHERE id IN (
  SELECT DISTINCT item_id FROM vault_events WHERE event = 'vaulted'
)
AND id NOT IN (
  SELECT item_id FROM vault_events WHERE event IN ('unvaulted', 'resurgence')
  AND effective_date > (
    SELECT MAX(effective_date) FROM vault_events ve2
    WHERE ve2.item_id = vault_events.item_id AND ve2.event = 'vaulted'
  )
);
