-- TODA POS: khôi phục menu/kho/bàn từ DB local (KHÔNG gồm users/mật khẩu). org/branch đã remap sang hệ thống live.
BEGIN;
SET session_replication_role = replica;
TRUNCATE TABLE menu_item_modifier_groups, modifiers, menu_items, modifier_groups, menu_categories, recipe_ingredients, inventory_items, inventory_categories, tables, spaces CASCADE;
--
-- PostgreSQL database dump
--

\restrict aGPugIDAM2H09xVEIjylnztsHcEdRqqnqx4sO3WOwtlyJUACsS5rLRWacgucfqI

-- Dumped from database version 17.10
-- Dumped by pg_dump version 17.10

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Data for Name: inventory_categories; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.inventory_categories (id, branch_id, organization_id, name) FROM stdin;
ba348ec7-7a7b-4efd-ad62-6d06bec3326a	d7da975e-15df-40ef-8088-f6317d809a6a	2c8114be-1e1e-47dc-8f06-6008dbaabcff	Nguyên liệu chính
\.


--
-- Data for Name: inventory_items; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.inventory_items (id, branch_id, organization_id, category_id, name, unit, current_stock, min_stock, cost_per_unit) FROM stdin;
f3c0a4f4-2fa2-4f4b-a843-c23ec8bdd54d	d7da975e-15df-40ef-8088-f6317d809a6a	2c8114be-1e1e-47dc-8f06-6008dbaabcff	ba348ec7-7a7b-4efd-ad62-6d06bec3326a	Gạo	kg	50.000	10.000	1800000
53a2488e-b9b9-4466-9345-bef872c71894	d7da975e-15df-40ef-8088-f6317d809a6a	2c8114be-1e1e-47dc-8f06-6008dbaabcff	ba348ec7-7a7b-4efd-ad62-6d06bec3326a	Thịt gà	kg	25.000	5.000	6500000
1446e53b-b804-440f-8e3f-0a79f6573ecb	d7da975e-15df-40ef-8088-f6317d809a6a	2c8114be-1e1e-47dc-8f06-6008dbaabcff	ba348ec7-7a7b-4efd-ad62-6d06bec3326a	Bánh phở	kg	20.000	5.000	2200000
0a5c7ea5-3b7e-4102-a03b-85907ae9fbbe	d7da975e-15df-40ef-8088-f6317d809a6a	2c8114be-1e1e-47dc-8f06-6008dbaabcff	ba348ec7-7a7b-4efd-ad62-6d06bec3326a	Trà	kg	5.000	1.000	12000000
\.


--
-- Data for Name: menu_categories; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.menu_categories (id, branch_id, organization_id, name, description, image_url, sort_order, is_active) FROM stdin;
d15bc5c1-d750-4fa9-8e2d-936281c77964	d7da975e-15df-40ef-8088-f6317d809a6a	2c8114be-1e1e-47dc-8f06-6008dbaabcff	CÀ PHÊ	Đồ uống	\N	1	t
4e00472f-6114-4232-9f14-0291c13bc609	d7da975e-15df-40ef-8088-f6317d809a6a	2c8114be-1e1e-47dc-8f06-6008dbaabcff	SINH TỐ & ĐÁ XAY	Đồ uống	\N	2	t
4398c087-28b5-4ac0-8ef7-1f108775b070	d7da975e-15df-40ef-8088-f6317d809a6a	2c8114be-1e1e-47dc-8f06-6008dbaabcff	TRÀ & MÓN KHÁC	TRA	\N	3	t
5a2ef0b2-6dfc-4fff-8f0f-4204840dc5e8	d7da975e-15df-40ef-8088-f6317d809a6a	2c8114be-1e1e-47dc-8f06-6008dbaabcff	CÀ PHÊ BỘT HẠT	ITEM_TYPE-RRUQ	\N	5	t
56cdc459-8c4a-4fe1-8564-def93d525d2a	d7da975e-15df-40ef-8088-f6317d809a6a	2c8114be-1e1e-47dc-8f06-6008dbaabcff	THUỐC LÁ	ITEM_TYPE-Q595	\N	4	t
\.


--
-- Data for Name: menu_items; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.menu_items (id, category_id, branch_id, organization_id, name, description, price, image_url, is_available, sort_order, preparation_time_min) FROM stdin;
5962507b-c798-4929-85f4-317f34965e41	4398c087-28b5-4ac0-8ef7-1f108775b070	d7da975e-15df-40ef-8088-f6317d809a6a	2c8114be-1e1e-47dc-8f06-6008dbaabcff	Ly trà đá	Ma mon: ITEM-9EEI | Don vi: LY	200000	/images/generated-menu-images/057-item-9eei.svg	t	149	\N
d11fdab3-874f-4e3f-ad48-15f7a045adc2	d15bc5c1-d750-4fa9-8e2d-936281c77964	d7da975e-15df-40ef-8088-f6317d809a6a	2c8114be-1e1e-47dc-8f06-6008dbaabcff	Cà phê đá	Ma mon: SP01 | Don vi: LY	1500000	https://image.foodbook.vn/images/20250716/1752632395617-Capheda.png?width185?width185?width185?width185	t	1	\N
e76f67ca-64ee-46d5-aecf-0c7205be8a56	d15bc5c1-d750-4fa9-8e2d-936281c77964	d7da975e-15df-40ef-8088-f6317d809a6a	2c8114be-1e1e-47dc-8f06-6008dbaabcff	Cà phê đá (nhẹ)	Ma mon: ITEM-G7ZN | Don vi: LY	1300000	https://image.foodbook.vn/images/20250716/1752649224997-Capheda.png?width185?width185	t	2	\N
75b911c4-99dc-4872-bb7e-774e05188c13	d15bc5c1-d750-4fa9-8e2d-936281c77964	d7da975e-15df-40ef-8088-f6317d809a6a	2c8114be-1e1e-47dc-8f06-6008dbaabcff	Cà phê sữa đá	Ma mon: SP02 | Don vi: LY	1800000	https://image.foodbook.vn/images/20250716/1752646393591-caphesuada.png?width185?width185	t	3	\N
81ef5eee-7af3-40ec-99e2-e75b8472bcb9	d15bc5c1-d750-4fa9-8e2d-936281c77964	d7da975e-15df-40ef-8088-f6317d809a6a	2c8114be-1e1e-47dc-8f06-6008dbaabcff	Cà phê sữa đá (nhẹ)	Ma mon: ITEM-7R7B | Don vi: LY	1600000	https://image.foodbook.vn/images/20250716/1752646415460-caphesuada.png?width185	t	4	\N
b1c226b9-0a98-41a7-9b3f-997a39911c5d	d15bc5c1-d750-4fa9-8e2d-936281c77964	d7da975e-15df-40ef-8088-f6317d809a6a	2c8114be-1e1e-47dc-8f06-6008dbaabcff	Bạc xỉu	Ma mon: SP03 | Don vi: LY	2000000	https://image.foodbook.vn/images/20250719/1752889711682-image_picker_34F54B6F-D091-4E44-9179-66B49330364F-48334-00001C2DF4871ACF.jpg?width185?width185	t	5	\N
f98edd94-beb4-4201-bc39-a1802f2000fc	d15bc5c1-d750-4fa9-8e2d-936281c77964	d7da975e-15df-40ef-8088-f6317d809a6a	2c8114be-1e1e-47dc-8f06-6008dbaabcff	Bạc xỉu (nhẹ)	Ma mon: SP31 | Don vi: LY	1800000	/images/generated-menu-images/007-sp31.svg	t	6	\N
78ea21fc-59e6-4ea3-8c38-39313eac61e3	d15bc5c1-d750-4fa9-8e2d-936281c77964	d7da975e-15df-40ef-8088-f6317d809a6a	2c8114be-1e1e-47dc-8f06-6008dbaabcff	Americano đá	Ma mon: SP04 | Don vi: LY	1500000	https://image.foodbook.vn/images/20250716/1752649194886-americano.png?width185?width185?width185	t	7	\N
384be15a-cfe2-479f-8ca5-fab22522985c	d15bc5c1-d750-4fa9-8e2d-936281c77964	d7da975e-15df-40ef-8088-f6317d809a6a	2c8114be-1e1e-47dc-8f06-6008dbaabcff	Americano đá (nhẹ)	Ma mon: ITEM-P3ZO | Don vi: LY	1300000	/images/generated-menu-images/009-item-p3zo.svg	t	8	\N
9bb9fc4b-6832-4864-9e83-23c09dc8c448	d15bc5c1-d750-4fa9-8e2d-936281c77964	d7da975e-15df-40ef-8088-f6317d809a6a	2c8114be-1e1e-47dc-8f06-6008dbaabcff	Espresso (nóng)	Ma mon: SP05 | Don vi: LY	1500000	https://image.foodbook.vn/images/20250719/1752891649687-image_picker_8B95EC34-9B49-4FC0-9466-4F96FDE64001-48718-00001C37B716C29B.jpg?width185?width185	t	9	\N
373d41d3-5d05-41c1-86a5-c4fd4d2371df	d15bc5c1-d750-4fa9-8e2d-936281c77964	d7da975e-15df-40ef-8088-f6317d809a6a	2c8114be-1e1e-47dc-8f06-6008dbaabcff	Espresso nhẹ (nóng)	Ma mon: ITEM-IZ65 | Don vi: LY	1300000	/images/generated-menu-images/011-item-iz65.svg	t	10	\N
d490090a-f547-407f-a839-7db95c7b9723	d15bc5c1-d750-4fa9-8e2d-936281c77964	d7da975e-15df-40ef-8088-f6317d809a6a	2c8114be-1e1e-47dc-8f06-6008dbaabcff	Cà phê đá (pha phin)	Ma mon: ITEM-5CRK | Don vi: LY	1800000	https://s3-hfx03.fptcloud.com/fabi-ai/temp_images/2025-10-06/ca_phe_phin_en_83cbe282.png?width185	t	11	\N
b06e811b-faaf-4e11-8cd8-02454c030ab3	d15bc5c1-d750-4fa9-8e2d-936281c77964	d7da975e-15df-40ef-8088-f6317d809a6a	2c8114be-1e1e-47dc-8f06-6008dbaabcff	Cà phê sữa đá (pha phin)	Ma mon: ITEM-0TW2 | Don vi: LY	2100000	https://s3-hfx03.fptcloud.com/fabi-ai/temp_images/2025-09-29/ca_phe_sua_pha_bang_bo_phin_e2c88cf6.png?width185	t	12	\N
dd1015d7-a8e9-4bbe-969d-6efeca3171f4	d15bc5c1-d750-4fa9-8e2d-936281c77964	d7da975e-15df-40ef-8088-f6317d809a6a	2c8114be-1e1e-47dc-8f06-6008dbaabcff	Cà phê muối	Ma mon: SP07 | Don vi: LY	2500000	https://fabi-ai.iposdev.com/fabi-ai/temp_images/2025-09-18/ca_phe_muoi_6b61c6af.png?width185?width185	t	13	\N
6631554c-12cc-413c-8bb9-f06f61105f79	d15bc5c1-d750-4fa9-8e2d-936281c77964	d7da975e-15df-40ef-8088-f6317d809a6a	2c8114be-1e1e-47dc-8f06-6008dbaabcff	Cà phê sữa tươi	Ma mon: SP06 | Don vi: LY	2000000	https://image.foodbook.vn/images/20250719/1752891734434-image_picker_95C5431F-BD31-489E-8933-DC2EBB656BBD-48718-00001C38339F06FB.jpg?width185?width185?width185?width185?width185	t	14	\N
b0ea3545-153a-4e42-a22d-06b177de2864	d15bc5c1-d750-4fa9-8e2d-936281c77964	d7da975e-15df-40ef-8088-f6317d809a6a	2c8114be-1e1e-47dc-8f06-6008dbaabcff	Cà phê sữa hạnh nhân	Ma mon: SP34 | Don vi: LY	2200000	https://s3-hfx03.fptcloud.com/fabi-ai/temp_images/2025-11-09/phe_sua_hanh_nhan_9ab6816f.png?width185?width185	f	15	\N
93b82e14-680f-40c0-94a5-348f5c52807a	d15bc5c1-d750-4fa9-8e2d-936281c77964	d7da975e-15df-40ef-8088-f6317d809a6a	2c8114be-1e1e-47dc-8f06-6008dbaabcff	Cà phê vết loang	Ma mon: SP38 | Don vi: LY	2200000	https://image.foodbook.vn/images/20250716/1752648615941-caphe_dirty.png?width185?width185?width185?width185?width185	t	16	\N
25a48ab9-fd98-4d3d-ab51-8cbf22e8e910	d15bc5c1-d750-4fa9-8e2d-936281c77964	d7da975e-15df-40ef-8088-f6317d809a6a	2c8114be-1e1e-47dc-8f06-6008dbaabcff	Bạc xỉu truyền thống	Ma mon: SP36 | Don vi: LY	2000000	/images/generated-menu-images/018-sp36.svg	t	17	\N
288561fd-1a65-4ed3-a32f-a0795b764248	d15bc5c1-d750-4fa9-8e2d-936281c77964	d7da975e-15df-40ef-8088-f6317d809a6a	2c8114be-1e1e-47dc-8f06-6008dbaabcff	Bạc xỉu truyền thống (nhẹ)	Ma mon: SP37 | Don vi: LY	1800000	/images/generated-menu-images/019-sp37.svg	t	18	\N
837c5c7c-b60f-4f9b-a358-e0af399a540f	d15bc5c1-d750-4fa9-8e2d-936281c77964	d7da975e-15df-40ef-8088-f6317d809a6a	2c8114be-1e1e-47dc-8f06-6008dbaabcff	Cà phê sữa hạnh nhân (nhẹ)	Ma mon: SP35 | Don vi: LY	2000000	/images/generated-menu-images/020-sp35.svg	f	18	\N
72affe31-9b2f-4027-9cee-acca77cbc178	d15bc5c1-d750-4fa9-8e2d-936281c77964	d7da975e-15df-40ef-8088-f6317d809a6a	2c8114be-1e1e-47dc-8f06-6008dbaabcff	Cà phê đá (hạt Arabica)	Ma mon: ITEM-SJH3 | Don vi: LY	1900000	https://image.foodbook.vn/images/20250714/1752480044301-image_picker_2B5A6EB3-682D-48E5-9EF2-B49625716F2D-30967-00001934ABD12D44.jpg?width185?width185?width185?width185?width185	t	19	\N
27ccd9ea-129f-41a0-9f07-4115e8921b41	d15bc5c1-d750-4fa9-8e2d-936281c77964	d7da975e-15df-40ef-8088-f6317d809a6a	2c8114be-1e1e-47dc-8f06-6008dbaabcff	Cà phê đá (Blend)	Ma mon: ITEM-OMX8 | Don vi: LY	1700000	https://image.foodbook.vn/images/20250714/1752480044301-image_picker_2B5A6EB3-682D-48E5-9EF2-B49625716F2D-30967-00001934ABD12D44.jpg?width185?width185?width185?width185?width185?width185?width185	t	20	\N
32cb3fea-b3d1-44b2-aabe-103d79e8eaa9	d15bc5c1-d750-4fa9-8e2d-936281c77964	d7da975e-15df-40ef-8088-f6317d809a6a	2c8114be-1e1e-47dc-8f06-6008dbaabcff	Cà phê vết loang (nhẹ)	Ma mon: SP39 | Don vi: LY	2000000	https://image.foodbook.vn/images/20250716/1752648642456-caphe_dirty.png?width185?width185?width185?width185	f	20	\N
5ab22ff3-3817-4453-ba69-12e062968ac8	d15bc5c1-d750-4fa9-8e2d-936281c77964	d7da975e-15df-40ef-8088-f6317d809a6a	2c8114be-1e1e-47dc-8f06-6008dbaabcff	Cà phê sữa đặc biệt	Ma mon: SP32 | Don vi: LY	2200000	/images/generated-menu-images/024-sp32.svg	t	21	\N
98cfb67d-3399-412d-b48c-e0161f22fb05	d15bc5c1-d750-4fa9-8e2d-936281c77964	d7da975e-15df-40ef-8088-f6317d809a6a	2c8114be-1e1e-47dc-8f06-6008dbaabcff	Cà phê sữa đặc biệt (nhẹ)	Ma mon: SP33 | Don vi: LY	2000000	/images/generated-menu-images/025-sp33.svg	t	22	\N
b63651d8-cc93-4a37-9ab6-a1961609f879	d15bc5c1-d750-4fa9-8e2d-936281c77964	d7da975e-15df-40ef-8088-f6317d809a6a	2c8114be-1e1e-47dc-8f06-6008dbaabcff	Cà phê V60	Ma mon: ITEM-HVI7 | Don vi: LY	2500000	/images/generated-menu-images/026-item-hvi7.svg	t	23	\N
4e995cbf-49a1-4493-8f85-2c18c9f4871b	d15bc5c1-d750-4fa9-8e2d-936281c77964	d7da975e-15df-40ef-8088-f6317d809a6a	2c8114be-1e1e-47dc-8f06-6008dbaabcff	Cà phê mix	Ma mon: ITEM-9KET | Don vi: LY	1700000	/images/generated-menu-images/027-item-9ket.svg	t	24	\N
5bfad2c5-8371-495d-96ba-9d91a013b6d8	4e00472f-6114-4232-9f14-0291c13bc609	d7da975e-15df-40ef-8088-f6317d809a6a	2c8114be-1e1e-47dc-8f06-6008dbaabcff	Sữa chua	Ma mon: SP09 | Don vi: LY	2500000	/images/generated-menu-images/028-sp09.svg	t	51	\N
88e85e3e-d3a7-47ff-9bd1-6d94443836a1	4e00472f-6114-4232-9f14-0291c13bc609	d7da975e-15df-40ef-8088-f6317d809a6a	2c8114be-1e1e-47dc-8f06-6008dbaabcff	Sữa chua việt quất	Ma mon: SP10 | Don vi: LY	2800000	https://image.foodbook.vn/images/20250716/1752649411610-IMG_0797.JPEG?width185	t	52	\N
8b0cf331-1cb3-4785-8667-bfb2c9722d80	4e00472f-6114-4232-9f14-0291c13bc609	d7da975e-15df-40ef-8088-f6317d809a6a	2c8114be-1e1e-47dc-8f06-6008dbaabcff	Sữa chua dâu tây	Ma mon: SP11 | Don vi: LY	2800000	/images/generated-menu-images/030-sp11.svg	t	53	\N
472d99cc-26e1-4111-875d-f00c60ea0629	4e00472f-6114-4232-9f14-0291c13bc609	d7da975e-15df-40ef-8088-f6317d809a6a	2c8114be-1e1e-47dc-8f06-6008dbaabcff	Cacao đá xay	Ma mon: SP14 | Don vi: LY	2500000	https://image.foodbook.vn/images/20250719/1752891865625-image_picker_892F676B-94DE-407C-847C-D9BCA5F49692-48718-00001C38E0D7E3D1.jpg?width185	t	56	\N
f786ec4a-e76f-46d8-aba2-45ec5f5af436	4e00472f-6114-4232-9f14-0291c13bc609	d7da975e-15df-40ef-8088-f6317d809a6a	2c8114be-1e1e-47dc-8f06-6008dbaabcff	Matcha đá xay	Ma mon: SP15 | Don vi: LY	2900000	/images/generated-menu-images/032-sp15.svg	t	57	\N
f20a04ec-dc8d-4efa-b573-ef8bebf89b43	4e00472f-6114-4232-9f14-0291c13bc609	d7da975e-15df-40ef-8088-f6317d809a6a	2c8114be-1e1e-47dc-8f06-6008dbaabcff	Cà phê đá xay	Ma mon: SP13 | Don vi: LY	2500000	/images/generated-menu-images/033-sp13.svg	t	59	\N
3777b8d7-23de-44d7-918e-b803ce444e27	4398c087-28b5-4ac0-8ef7-1f108775b070	d7da975e-15df-40ef-8088-f6317d809a6a	2c8114be-1e1e-47dc-8f06-6008dbaabcff	Cacao sữa	Ma mon: SP16 | Don vi: LY	1800000	https://image.foodbook.vn/images/20250719/1752892028279-image_picker_265C42B4-5573-4788-B897-6DD052E22368-48718-00001C39CD79C110.jpg?width185	t	101	\N
e37bb2ea-bbb9-49a5-8f76-9936f68257d0	4398c087-28b5-4ac0-8ef7-1f108775b070	d7da975e-15df-40ef-8088-f6317d809a6a	2c8114be-1e1e-47dc-8f06-6008dbaabcff	Matcha sữa	Ma mon: SP17 | Don vi: LY	2000000	https://image.foodbook.vn/images/20250719/1752891706707-image_picker_FCF7CEEF-B75E-4848-A840-8288F4B9741F-48718-00001C3807931F82.jpg?width185	t	102	\N
c3cee823-0857-4670-a580-d86b9863371b	4398c087-28b5-4ac0-8ef7-1f108775b070	d7da975e-15df-40ef-8088-f6317d809a6a	2c8114be-1e1e-47dc-8f06-6008dbaabcff	Trà chanh	Ma mon: SP18 | Don vi: LY	1500000	/images/generated-menu-images/036-sp18.svg	t	103	\N
45cdc9a5-d79a-41d2-a406-2bff6c8feda5	4398c087-28b5-4ac0-8ef7-1f108775b070	d7da975e-15df-40ef-8088-f6317d809a6a	2c8114be-1e1e-47dc-8f06-6008dbaabcff	Trà tắc	Ma mon: SP19 | Don vi: LY	1500000	/images/generated-menu-images/037-sp19.svg	t	104	\N
e3f4a16d-edd5-435f-97cc-9ab6b9eefcf7	4398c087-28b5-4ac0-8ef7-1f108775b070	d7da975e-15df-40ef-8088-f6317d809a6a	2c8114be-1e1e-47dc-8f06-6008dbaabcff	Trà lài	Ma mon: SP30 | Don vi: LY	1500000	/images/generated-menu-images/038-sp30.svg	t	105	\N
fc5b2de2-3037-4238-a466-f9c4e7330440	4398c087-28b5-4ac0-8ef7-1f108775b070	d7da975e-15df-40ef-8088-f6317d809a6a	2c8114be-1e1e-47dc-8f06-6008dbaabcff	Hồng trà	Ma mon: ITEM-IYR7 | Don vi: LY	1500000	/images/generated-menu-images/039-item-iyr7.svg	t	106	\N
2e8162a5-60ef-4762-8a9a-29b6eb835952	4398c087-28b5-4ac0-8ef7-1f108775b070	d7da975e-15df-40ef-8088-f6317d809a6a	2c8114be-1e1e-47dc-8f06-6008dbaabcff	Trà bông cúc	Ma mon: SP24 | Don vi: LY	1500000	/images/generated-menu-images/040-sp24.svg	t	107	\N
959ae193-2da5-4527-9b1b-3de59f185fa0	4398c087-28b5-4ac0-8ef7-1f108775b070	d7da975e-15df-40ef-8088-f6317d809a6a	2c8114be-1e1e-47dc-8f06-6008dbaabcff	Trà Atiso đỏ	Ma mon: ITEM-G8BX | Don vi: LY	1500000	/images/generated-menu-images/041-item-g8bx.svg	t	108	\N
f1ec0792-4e3d-4d7c-b2f1-dd8e6528c960	4398c087-28b5-4ac0-8ef7-1f108775b070	d7da975e-15df-40ef-8088-f6317d809a6a	2c8114be-1e1e-47dc-8f06-6008dbaabcff	Trà tắc xí muội	Ma mon: SP20 | Don vi: LY	1800000	/images/generated-menu-images/042-sp20.svg	t	109	\N
bb97d18a-fe02-4750-bf7f-46eb8dd7bc47	4398c087-28b5-4ac0-8ef7-1f108775b070	d7da975e-15df-40ef-8088-f6317d809a6a	2c8114be-1e1e-47dc-8f06-6008dbaabcff	Trà đào	Ma mon: SP27 | Don vi: LY	2200000	/images/generated-menu-images/043-sp27.svg	t	110	\N
eb4029ad-4713-4aa8-92be-247626530c51	4398c087-28b5-4ac0-8ef7-1f108775b070	d7da975e-15df-40ef-8088-f6317d809a6a	2c8114be-1e1e-47dc-8f06-6008dbaabcff	Trà dâu tây	Ma mon: ITEM-VGJQ | Don vi: LY	1800000	/images/generated-menu-images/044-item-vgjq.svg	t	111	\N
57046ebd-0da5-46e6-8e25-e256e2944818	4398c087-28b5-4ac0-8ef7-1f108775b070	d7da975e-15df-40ef-8088-f6317d809a6a	2c8114be-1e1e-47dc-8f06-6008dbaabcff	Trà chanh quế	Ma mon: SP23 | Don vi: LY	2000000	/images/generated-menu-images/045-sp23.svg	t	112	\N
110a06d2-4ccc-48fb-91a2-47202ef95bb5	4398c087-28b5-4ac0-8ef7-1f108775b070	d7da975e-15df-40ef-8088-f6317d809a6a	2c8114be-1e1e-47dc-8f06-6008dbaabcff	Trà bạc hà	Ma mon: ITEM-HH5C | Don vi: LY	1800000	/images/generated-menu-images/046-item-hh5c.svg	t	113	\N
8b076860-0038-4418-80cb-ca1256cffc39	4398c087-28b5-4ac0-8ef7-1f108775b070	d7da975e-15df-40ef-8088-f6317d809a6a	2c8114be-1e1e-47dc-8f06-6008dbaabcff	Trà chanh bạc hà	Ma mon: ITEM-VWIZ | Don vi: LY	2200000	/images/generated-menu-images/047-item-vwiz.svg	t	114	\N
6740e86f-8642-4047-9d4a-6d803ff30441	4398c087-28b5-4ac0-8ef7-1f108775b070	d7da975e-15df-40ef-8088-f6317d809a6a	2c8114be-1e1e-47dc-8f06-6008dbaabcff	Soda chanh	Ma mon: ITEM-U1WM | Don vi: LY	1800000	/images/generated-menu-images/048-item-u1wm.svg	t	115	\N
51183279-195b-49c5-a874-cb5a9234ab08	4398c087-28b5-4ac0-8ef7-1f108775b070	d7da975e-15df-40ef-8088-f6317d809a6a	2c8114be-1e1e-47dc-8f06-6008dbaabcff	Trà kem muối	Ma mon: SP21 | Don vi: LY	2500000	/images/generated-menu-images/049-sp21.svg	f	115	\N
574638b4-c988-4066-b7ce-e45bfaa2ae31	4398c087-28b5-4ac0-8ef7-1f108775b070	d7da975e-15df-40ef-8088-f6317d809a6a	2c8114be-1e1e-47dc-8f06-6008dbaabcff	Soda chanh bạc hà	Ma mon: ITEM-T220 | Don vi: LY	2200000	/images/generated-menu-images/050-item-t220.svg	t	116	\N
05fcddf9-b2e8-4380-8e9f-8590f99dac79	4398c087-28b5-4ac0-8ef7-1f108775b070	d7da975e-15df-40ef-8088-f6317d809a6a	2c8114be-1e1e-47dc-8f06-6008dbaabcff	Trà gừng	Ma mon: ITEM-RO1I | Don vi: LY	1500000	/images/generated-menu-images/051-item-ro1i.svg	t	117	\N
19fef023-e57d-4ba1-93a1-7549b0c09068	4398c087-28b5-4ac0-8ef7-1f108775b070	d7da975e-15df-40ef-8088-f6317d809a6a	2c8114be-1e1e-47dc-8f06-6008dbaabcff	Trà chanh gừng	Ma mon: SP22 | Don vi: LY	1800000	/images/generated-menu-images/052-sp22.svg	t	118	\N
aa10264a-007f-4b34-9026-256be277bf76	4398c087-28b5-4ac0-8ef7-1f108775b070	d7da975e-15df-40ef-8088-f6317d809a6a	2c8114be-1e1e-47dc-8f06-6008dbaabcff	Cam vắt	Ma mon: SP29 | Don vi: LY	1800000	/images/generated-menu-images/053-sp29.svg	t	119	\N
0e0df1f6-094b-4f9f-9c94-93cdeba31b33	4398c087-28b5-4ac0-8ef7-1f108775b070	d7da975e-15df-40ef-8088-f6317d809a6a	2c8114be-1e1e-47dc-8f06-6008dbaabcff	Nước suối Lavie	Ma mon: ITEM-GK3U | Don vi: LY	900000	/images/generated-menu-images/054-item-gk3u.svg	t	120	\N
a609e70d-d086-4d81-b353-448abc7d53f9	4398c087-28b5-4ac0-8ef7-1f108775b070	d7da975e-15df-40ef-8088-f6317d809a6a	2c8114be-1e1e-47dc-8f06-6008dbaabcff	Cacao kem muối	Ma mon: SP25 | Don vi: LY	2500000	/images/generated-menu-images/055-sp25.svg	t	131	\N
2178a413-36ca-4b60-98dd-118c1a79f123	4398c087-28b5-4ac0-8ef7-1f108775b070	d7da975e-15df-40ef-8088-f6317d809a6a	2c8114be-1e1e-47dc-8f06-6008dbaabcff	Matcha kem muối	Ma mon: SP26 | Don vi: LY	2900000	/images/generated-menu-images/056-sp26.svg	t	132	\N
aa4f85d2-2058-435b-8ec7-c1d77e2e4cc8	56cdc459-8c4a-4fe1-8564-def93d525d2a	d7da975e-15df-40ef-8088-f6317d809a6a	2c8114be-1e1e-47dc-8f06-6008dbaabcff	Thuốc lá Sài Gòn bạc	Ma mon: ITEM-ALBO | Don vi: GOI	1900000	https://image.foodbook.vn/images/20250715/1752550252419-image_picker_8CAF6791-496D-4A00-B7EF-60F7A11E1DF2-33117-0000197E12314E92.jpg?width185?width185?width185?width185	t	251	\N
cc19dc6f-a46d-4a66-94a5-ce2634dba0f1	56cdc459-8c4a-4fe1-8564-def93d525d2a	d7da975e-15df-40ef-8088-f6317d809a6a	2c8114be-1e1e-47dc-8f06-6008dbaabcff	Thuốc lá Con Mèo nhỏ	Ma mon: ITEM-I3JT | Don vi: GOI	1900000	https://image.foodbook.vn/images/20250715/1752550269729-image_picker_320C738F-72DB-4165-93B3-4D95FD430177-33117-0000197E44A86FFC.jpg?width185?width185?width185?width185	t	252	\N
db12567a-f25f-4c64-ae6a-53096d6147ca	56cdc459-8c4a-4fe1-8564-def93d525d2a	d7da975e-15df-40ef-8088-f6317d809a6a	2c8114be-1e1e-47dc-8f06-6008dbaabcff	Thuốc lá 555	Ma mon: ITEM-PXKI | Don vi: GOI	3800000	https://image.foodbook.vn/images/20250715/1752550261947-image_picker_42BBBEC6-825B-4DC9-A7C0-134EDC67FF54-33117-0000197E38798866.jpg?width185?width185?width185	t	253	\N
253cfdba-165d-4c95-a0ca-18a69443ad4d	56cdc459-8c4a-4fe1-8564-def93d525d2a	d7da975e-15df-40ef-8088-f6317d809a6a	2c8114be-1e1e-47dc-8f06-6008dbaabcff	Hột quẹt	Ma mon: ITEM-VS3V | Don vi: CAI	400000	/images/generated-menu-images/061-item-vs3v.svg	t	299	\N
30dda5a1-e86f-48f0-b57d-9a5ef3eeebe4	5a2ef0b2-6dfc-4fff-8f0f-4204840dc5e8	d7da975e-15df-40ef-8088-f6317d809a6a	2c8114be-1e1e-47dc-8f06-6008dbaabcff	Cà phê Toda 1 (250g)	1kg giá 220k | Ma mon: ITEM-URKF | Don vi: TUI	5500000	https://image.foodbook.vn/images/20250719/1752891922890-image_picker_6F6DA960-4181-482E-822E-075E6A18F3E6-48718-00001C393370C413.jpg?width185?width185?width185?width185?width185?width185?width185?width185?width185?width185?width185	t	301	\N
617b61a1-5164-4ab2-9430-15f90fc5cfa5	5a2ef0b2-6dfc-4fff-8f0f-4204840dc5e8	d7da975e-15df-40ef-8088-f6317d809a6a	2c8114be-1e1e-47dc-8f06-6008dbaabcff	Cà phê Toda 1 (500g)	1kg giá 220k | Ma mon: ITEM-V1Q5 | Don vi: TUI	11000000	https://image.foodbook.vn/images/20250719/1752891922890-image_picker_6F6DA960-4181-482E-822E-075E6A18F3E6-48718-00001C393370C413.jpg?width185?width185?width185?width185?width185?width185?width185?width185?width185	t	301	\N
38a41fc3-acd9-4836-9199-0a60de33c815	5a2ef0b2-6dfc-4fff-8f0f-4204840dc5e8	d7da975e-15df-40ef-8088-f6317d809a6a	2c8114be-1e1e-47dc-8f06-6008dbaabcff	Cà phê Toda 2 (500g)	1kg giá 240k, 80% Robusta + 20% Honey | Ma mon: ITEM-E2BT | Don vi: TUI	12000000	https://image.foodbook.vn/images/20250719/1752893449949-image_picker_05509D27-89DD-4D46-A468-D0D97E97AC80-48718-00001C3E2A7DBC10.jpg?width185?width185?width185?width185?width185?width185?width185?width185	t	303	\N
a0d6b06c-979e-4a28-ab1a-990eee5e8f20	5a2ef0b2-6dfc-4fff-8f0f-4204840dc5e8	d7da975e-15df-40ef-8088-f6317d809a6a	2c8114be-1e1e-47dc-8f06-6008dbaabcff	Cà phê Toda 3 (500g)	1kg 260k, 60% Robusta + 40% Honey | Ma mon: ITEM-X6PJ | Don vi: TUI	13000000	https://image.foodbook.vn/images/20250719/1752893523890-image_picker_BE239EE7-541C-4B8D-B140-288A430C1743-48718-00001C3E98AC0EFC.jpg?width185?width185?width185?width185?width185?width185?width185	t	304	\N
6201663c-2c67-4ea4-a8a8-ebfc182c2483	5a2ef0b2-6dfc-4fff-8f0f-4204840dc5e8	d7da975e-15df-40ef-8088-f6317d809a6a	2c8114be-1e1e-47dc-8f06-6008dbaabcff	Cà phê Toda 4 (500g)	1kg 300k, 100% Honey | Ma mon: ITEM-6FKD | Don vi: TUI	15000000	https://image.foodbook.vn/images/20250719/1752893475034-image_picker_FEB2A621-06B4-4F42-B8AA-C593E8CBAD0B-48718-00001C3E52548255.jpg?width185?width185?width185?width185?width185?width185?width185?width185?width185?width185	t	305	\N
\.


--
-- Data for Name: modifier_groups; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.modifier_groups (id, branch_id, organization_id, name, min_selections, max_selections, is_required) FROM stdin;
f06f9de2-f87f-4533-b567-0903b81953f8	d7da975e-15df-40ef-8088-f6317d809a6a	2c8114be-1e1e-47dc-8f06-6008dbaabcff	Đường / sữa / đá	0	6	f
969126e1-bf98-419d-ba11-d1c48f564aa0	d7da975e-15df-40ef-8088-f6317d809a6a	2c8114be-1e1e-47dc-8f06-6008dbaabcff	Món thêm	0	3	f
\.


--
-- Data for Name: menu_item_modifier_groups; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.menu_item_modifier_groups (item_id, group_id) FROM stdin;
e76f67ca-64ee-46d5-aecf-0c7205be8a56	f06f9de2-f87f-4533-b567-0903b81953f8
75b911c4-99dc-4872-bb7e-774e05188c13	f06f9de2-f87f-4533-b567-0903b81953f8
81ef5eee-7af3-40ec-99e2-e75b8472bcb9	f06f9de2-f87f-4533-b567-0903b81953f8
b1c226b9-0a98-41a7-9b3f-997a39911c5d	f06f9de2-f87f-4533-b567-0903b81953f8
f98edd94-beb4-4201-bc39-a1802f2000fc	f06f9de2-f87f-4533-b567-0903b81953f8
78ea21fc-59e6-4ea3-8c38-39313eac61e3	f06f9de2-f87f-4533-b567-0903b81953f8
384be15a-cfe2-479f-8ca5-fab22522985c	f06f9de2-f87f-4533-b567-0903b81953f8
9bb9fc4b-6832-4864-9e83-23c09dc8c448	f06f9de2-f87f-4533-b567-0903b81953f8
373d41d3-5d05-41c1-86a5-c4fd4d2371df	f06f9de2-f87f-4533-b567-0903b81953f8
d490090a-f547-407f-a839-7db95c7b9723	f06f9de2-f87f-4533-b567-0903b81953f8
b06e811b-faaf-4e11-8cd8-02454c030ab3	f06f9de2-f87f-4533-b567-0903b81953f8
dd1015d7-a8e9-4bbe-969d-6efeca3171f4	f06f9de2-f87f-4533-b567-0903b81953f8
6631554c-12cc-413c-8bb9-f06f61105f79	f06f9de2-f87f-4533-b567-0903b81953f8
b0ea3545-153a-4e42-a22d-06b177de2864	f06f9de2-f87f-4533-b567-0903b81953f8
93b82e14-680f-40c0-94a5-348f5c52807a	f06f9de2-f87f-4533-b567-0903b81953f8
25a48ab9-fd98-4d3d-ab51-8cbf22e8e910	f06f9de2-f87f-4533-b567-0903b81953f8
288561fd-1a65-4ed3-a32f-a0795b764248	f06f9de2-f87f-4533-b567-0903b81953f8
837c5c7c-b60f-4f9b-a358-e0af399a540f	f06f9de2-f87f-4533-b567-0903b81953f8
72affe31-9b2f-4027-9cee-acca77cbc178	f06f9de2-f87f-4533-b567-0903b81953f8
27ccd9ea-129f-41a0-9f07-4115e8921b41	f06f9de2-f87f-4533-b567-0903b81953f8
32cb3fea-b3d1-44b2-aabe-103d79e8eaa9	f06f9de2-f87f-4533-b567-0903b81953f8
5ab22ff3-3817-4453-ba69-12e062968ac8	f06f9de2-f87f-4533-b567-0903b81953f8
98cfb67d-3399-412d-b48c-e0161f22fb05	f06f9de2-f87f-4533-b567-0903b81953f8
b63651d8-cc93-4a37-9ab6-a1961609f879	f06f9de2-f87f-4533-b567-0903b81953f8
4e995cbf-49a1-4493-8f85-2c18c9f4871b	f06f9de2-f87f-4533-b567-0903b81953f8
5bfad2c5-8371-495d-96ba-9d91a013b6d8	f06f9de2-f87f-4533-b567-0903b81953f8
88e85e3e-d3a7-47ff-9bd1-6d94443836a1	f06f9de2-f87f-4533-b567-0903b81953f8
8b0cf331-1cb3-4785-8667-bfb2c9722d80	f06f9de2-f87f-4533-b567-0903b81953f8
472d99cc-26e1-4111-875d-f00c60ea0629	f06f9de2-f87f-4533-b567-0903b81953f8
f786ec4a-e76f-46d8-aba2-45ec5f5af436	f06f9de2-f87f-4533-b567-0903b81953f8
f20a04ec-dc8d-4efa-b573-ef8bebf89b43	f06f9de2-f87f-4533-b567-0903b81953f8
3777b8d7-23de-44d7-918e-b803ce444e27	f06f9de2-f87f-4533-b567-0903b81953f8
e37bb2ea-bbb9-49a5-8f76-9936f68257d0	f06f9de2-f87f-4533-b567-0903b81953f8
c3cee823-0857-4670-a580-d86b9863371b	f06f9de2-f87f-4533-b567-0903b81953f8
45cdc9a5-d79a-41d2-a406-2bff6c8feda5	f06f9de2-f87f-4533-b567-0903b81953f8
e3f4a16d-edd5-435f-97cc-9ab6b9eefcf7	f06f9de2-f87f-4533-b567-0903b81953f8
fc5b2de2-3037-4238-a466-f9c4e7330440	f06f9de2-f87f-4533-b567-0903b81953f8
2e8162a5-60ef-4762-8a9a-29b6eb835952	f06f9de2-f87f-4533-b567-0903b81953f8
959ae193-2da5-4527-9b1b-3de59f185fa0	f06f9de2-f87f-4533-b567-0903b81953f8
f1ec0792-4e3d-4d7c-b2f1-dd8e6528c960	f06f9de2-f87f-4533-b567-0903b81953f8
bb97d18a-fe02-4750-bf7f-46eb8dd7bc47	f06f9de2-f87f-4533-b567-0903b81953f8
eb4029ad-4713-4aa8-92be-247626530c51	f06f9de2-f87f-4533-b567-0903b81953f8
57046ebd-0da5-46e6-8e25-e256e2944818	f06f9de2-f87f-4533-b567-0903b81953f8
110a06d2-4ccc-48fb-91a2-47202ef95bb5	f06f9de2-f87f-4533-b567-0903b81953f8
8b076860-0038-4418-80cb-ca1256cffc39	f06f9de2-f87f-4533-b567-0903b81953f8
6740e86f-8642-4047-9d4a-6d803ff30441	f06f9de2-f87f-4533-b567-0903b81953f8
51183279-195b-49c5-a874-cb5a9234ab08	f06f9de2-f87f-4533-b567-0903b81953f8
574638b4-c988-4066-b7ce-e45bfaa2ae31	f06f9de2-f87f-4533-b567-0903b81953f8
05fcddf9-b2e8-4380-8e9f-8590f99dac79	f06f9de2-f87f-4533-b567-0903b81953f8
19fef023-e57d-4ba1-93a1-7549b0c09068	f06f9de2-f87f-4533-b567-0903b81953f8
aa10264a-007f-4b34-9026-256be277bf76	f06f9de2-f87f-4533-b567-0903b81953f8
0e0df1f6-094b-4f9f-9c94-93cdeba31b33	f06f9de2-f87f-4533-b567-0903b81953f8
a609e70d-d086-4d81-b353-448abc7d53f9	f06f9de2-f87f-4533-b567-0903b81953f8
2178a413-36ca-4b60-98dd-118c1a79f123	f06f9de2-f87f-4533-b567-0903b81953f8
5962507b-c798-4929-85f4-317f34965e41	f06f9de2-f87f-4533-b567-0903b81953f8
e76f67ca-64ee-46d5-aecf-0c7205be8a56	969126e1-bf98-419d-ba11-d1c48f564aa0
75b911c4-99dc-4872-bb7e-774e05188c13	969126e1-bf98-419d-ba11-d1c48f564aa0
81ef5eee-7af3-40ec-99e2-e75b8472bcb9	969126e1-bf98-419d-ba11-d1c48f564aa0
b1c226b9-0a98-41a7-9b3f-997a39911c5d	969126e1-bf98-419d-ba11-d1c48f564aa0
f98edd94-beb4-4201-bc39-a1802f2000fc	969126e1-bf98-419d-ba11-d1c48f564aa0
78ea21fc-59e6-4ea3-8c38-39313eac61e3	969126e1-bf98-419d-ba11-d1c48f564aa0
384be15a-cfe2-479f-8ca5-fab22522985c	969126e1-bf98-419d-ba11-d1c48f564aa0
9bb9fc4b-6832-4864-9e83-23c09dc8c448	969126e1-bf98-419d-ba11-d1c48f564aa0
373d41d3-5d05-41c1-86a5-c4fd4d2371df	969126e1-bf98-419d-ba11-d1c48f564aa0
d490090a-f547-407f-a839-7db95c7b9723	969126e1-bf98-419d-ba11-d1c48f564aa0
b06e811b-faaf-4e11-8cd8-02454c030ab3	969126e1-bf98-419d-ba11-d1c48f564aa0
dd1015d7-a8e9-4bbe-969d-6efeca3171f4	969126e1-bf98-419d-ba11-d1c48f564aa0
6631554c-12cc-413c-8bb9-f06f61105f79	969126e1-bf98-419d-ba11-d1c48f564aa0
b0ea3545-153a-4e42-a22d-06b177de2864	969126e1-bf98-419d-ba11-d1c48f564aa0
93b82e14-680f-40c0-94a5-348f5c52807a	969126e1-bf98-419d-ba11-d1c48f564aa0
25a48ab9-fd98-4d3d-ab51-8cbf22e8e910	969126e1-bf98-419d-ba11-d1c48f564aa0
288561fd-1a65-4ed3-a32f-a0795b764248	969126e1-bf98-419d-ba11-d1c48f564aa0
837c5c7c-b60f-4f9b-a358-e0af399a540f	969126e1-bf98-419d-ba11-d1c48f564aa0
72affe31-9b2f-4027-9cee-acca77cbc178	969126e1-bf98-419d-ba11-d1c48f564aa0
27ccd9ea-129f-41a0-9f07-4115e8921b41	969126e1-bf98-419d-ba11-d1c48f564aa0
32cb3fea-b3d1-44b2-aabe-103d79e8eaa9	969126e1-bf98-419d-ba11-d1c48f564aa0
5ab22ff3-3817-4453-ba69-12e062968ac8	969126e1-bf98-419d-ba11-d1c48f564aa0
98cfb67d-3399-412d-b48c-e0161f22fb05	969126e1-bf98-419d-ba11-d1c48f564aa0
b63651d8-cc93-4a37-9ab6-a1961609f879	969126e1-bf98-419d-ba11-d1c48f564aa0
4e995cbf-49a1-4493-8f85-2c18c9f4871b	969126e1-bf98-419d-ba11-d1c48f564aa0
5bfad2c5-8371-495d-96ba-9d91a013b6d8	969126e1-bf98-419d-ba11-d1c48f564aa0
88e85e3e-d3a7-47ff-9bd1-6d94443836a1	969126e1-bf98-419d-ba11-d1c48f564aa0
8b0cf331-1cb3-4785-8667-bfb2c9722d80	969126e1-bf98-419d-ba11-d1c48f564aa0
472d99cc-26e1-4111-875d-f00c60ea0629	969126e1-bf98-419d-ba11-d1c48f564aa0
f786ec4a-e76f-46d8-aba2-45ec5f5af436	969126e1-bf98-419d-ba11-d1c48f564aa0
f20a04ec-dc8d-4efa-b573-ef8bebf89b43	969126e1-bf98-419d-ba11-d1c48f564aa0
3777b8d7-23de-44d7-918e-b803ce444e27	969126e1-bf98-419d-ba11-d1c48f564aa0
e37bb2ea-bbb9-49a5-8f76-9936f68257d0	969126e1-bf98-419d-ba11-d1c48f564aa0
c3cee823-0857-4670-a580-d86b9863371b	969126e1-bf98-419d-ba11-d1c48f564aa0
45cdc9a5-d79a-41d2-a406-2bff6c8feda5	969126e1-bf98-419d-ba11-d1c48f564aa0
e3f4a16d-edd5-435f-97cc-9ab6b9eefcf7	969126e1-bf98-419d-ba11-d1c48f564aa0
fc5b2de2-3037-4238-a466-f9c4e7330440	969126e1-bf98-419d-ba11-d1c48f564aa0
2e8162a5-60ef-4762-8a9a-29b6eb835952	969126e1-bf98-419d-ba11-d1c48f564aa0
959ae193-2da5-4527-9b1b-3de59f185fa0	969126e1-bf98-419d-ba11-d1c48f564aa0
f1ec0792-4e3d-4d7c-b2f1-dd8e6528c960	969126e1-bf98-419d-ba11-d1c48f564aa0
bb97d18a-fe02-4750-bf7f-46eb8dd7bc47	969126e1-bf98-419d-ba11-d1c48f564aa0
eb4029ad-4713-4aa8-92be-247626530c51	969126e1-bf98-419d-ba11-d1c48f564aa0
57046ebd-0da5-46e6-8e25-e256e2944818	969126e1-bf98-419d-ba11-d1c48f564aa0
110a06d2-4ccc-48fb-91a2-47202ef95bb5	969126e1-bf98-419d-ba11-d1c48f564aa0
8b076860-0038-4418-80cb-ca1256cffc39	969126e1-bf98-419d-ba11-d1c48f564aa0
6740e86f-8642-4047-9d4a-6d803ff30441	969126e1-bf98-419d-ba11-d1c48f564aa0
51183279-195b-49c5-a874-cb5a9234ab08	969126e1-bf98-419d-ba11-d1c48f564aa0
574638b4-c988-4066-b7ce-e45bfaa2ae31	969126e1-bf98-419d-ba11-d1c48f564aa0
05fcddf9-b2e8-4380-8e9f-8590f99dac79	969126e1-bf98-419d-ba11-d1c48f564aa0
19fef023-e57d-4ba1-93a1-7549b0c09068	969126e1-bf98-419d-ba11-d1c48f564aa0
aa10264a-007f-4b34-9026-256be277bf76	969126e1-bf98-419d-ba11-d1c48f564aa0
0e0df1f6-094b-4f9f-9c94-93cdeba31b33	969126e1-bf98-419d-ba11-d1c48f564aa0
a609e70d-d086-4d81-b353-448abc7d53f9	969126e1-bf98-419d-ba11-d1c48f564aa0
2178a413-36ca-4b60-98dd-118c1a79f123	969126e1-bf98-419d-ba11-d1c48f564aa0
5962507b-c798-4929-85f4-317f34965e41	969126e1-bf98-419d-ba11-d1c48f564aa0
d11fdab3-874f-4e3f-ad48-15f7a045adc2	f06f9de2-f87f-4533-b567-0903b81953f8
d11fdab3-874f-4e3f-ad48-15f7a045adc2	969126e1-bf98-419d-ba11-d1c48f564aa0
\.


--
-- Data for Name: modifiers; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.modifiers (id, group_id, name, price, is_available) FROM stdin;
71a1139b-e076-4ef0-a215-ec2a846a4de6	f06f9de2-f87f-4533-b567-0903b81953f8	Đá riêng	0	t
c6716c26-7d8f-42d9-9f44-0c3a0cf66c5e	f06f9de2-f87f-4533-b567-0903b81953f8	Ngọt	0	t
a169e6b5-1ab9-42f9-9ec3-9c7d93fac060	f06f9de2-f87f-4533-b567-0903b81953f8	Rất ít đá	0	t
7ece2bcd-3456-422e-bcac-b31b6796b636	f06f9de2-f87f-4533-b567-0903b81953f8	Không đá	0	t
ba2a26cc-9a0d-46b5-9249-b141b48731f4	f06f9de2-f87f-4533-b567-0903b81953f8	Nóng	0	t
c2e4f9d8-31ea-4a66-a011-4775ccd54306	f06f9de2-f87f-4533-b567-0903b81953f8	Ít đá	0	t
843359fa-e9cf-4341-b1da-cbd46937ac05	f06f9de2-f87f-4533-b567-0903b81953f8	Rất ít sữa đặc (15g)	0	t
a9ce5422-bd67-409f-8fb0-da538fe8dff6	f06f9de2-f87f-4533-b567-0903b81953f8	Nhiều sữa đặc (30g)	0	t
9e9d35b0-a18e-4b44-a1d3-fe429b0e5743	f06f9de2-f87f-4533-b567-0903b81953f8	Ít đường	0	t
e35de312-10f8-4b02-9054-92c3df4f6b86	f06f9de2-f87f-4533-b567-0903b81953f8	Nhiều sữa đặc (35g)	0	t
08168dec-3a76-483c-b07c-ea99a331d5c4	f06f9de2-f87f-4533-b567-0903b81953f8	Không đường	0	t
e8c3ddd7-4840-475c-9af7-7c7ce94a491f	f06f9de2-f87f-4533-b567-0903b81953f8	Nhiều đường	0	t
0644559b-175c-4df6-ab37-e1c1bb64b3cb	f06f9de2-f87f-4533-b567-0903b81953f8	Ít sữa đặc (20g)	0	t
13bc1c79-01d2-49a7-81e1-1742fe708927	969126e1-bf98-419d-ba11-d1c48f564aa0	Thêm soda	500000	t
8160c616-cb1b-45e7-85d0-6566aa7c46e7	969126e1-bf98-419d-ba11-d1c48f564aa0	Thêm 1 shot cà phê	500000	t
78ccdf70-84c3-4178-b549-17c8360b8d64	969126e1-bf98-419d-ba11-d1c48f564aa0	Món thêm	500000	t
\.


--
-- Data for Name: recipe_ingredients; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.recipe_ingredients (menu_item_id, inventory_item_id, quantity_used) FROM stdin;
\.


--
-- Data for Name: spaces; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.spaces (id, branch_id, organization_id, name, description, floor_number, is_active, sort_order, created_at) FROM stdin;
43598e64-2ddf-4f8d-94fa-ff85bc2bf7ae	d7da975e-15df-40ef-8088-f6317d809a6a	2c8114be-1e1e-47dc-8f06-6008dbaabcff	Tầng trệt	Khu vực chính	1	t	1	2026-06-06 08:01:28.006379+00
054ed60c-5006-4561-bb7f-d1aeb4c8e2a0	d7da975e-15df-40ef-8088-f6317d809a6a	2c8114be-1e1e-47dc-8f06-6008dbaabcff	Lầu 1	Khu vực gia đình	2	t	2	2026-06-06 08:01:28.018927+00
9f54d605-0c9d-4680-86f5-c1c6dd6fb739	d7da975e-15df-40ef-8088-f6317d809a6a	2c8114be-1e1e-47dc-8f06-6008dbaabcff	Ngoài trời	Khu vực thoáng	1	t	3	2026-06-06 08:01:28.02611+00
\.


--
-- Data for Name: tables; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.tables (id, branch_id, organization_id, space_id, number, capacity, qr_code, status, position_x, position_y, created_at) FROM stdin;
dda16b9e-b416-4b35-be17-97c480aafad1	d7da975e-15df-40ef-8088-f6317d809a6a	2c8114be-1e1e-47dc-8f06-6008dbaabcff	43598e64-2ddf-4f8d-94fa-ff85bc2bf7ae	2	2	toda-chi-nhanh-chinh-ban-2	available	140	0	2026-06-06 08:01:28.044273+00
04980147-92fc-4987-b702-306829815a8a	d7da975e-15df-40ef-8088-f6317d809a6a	2c8114be-1e1e-47dc-8f06-6008dbaabcff	43598e64-2ddf-4f8d-94fa-ff85bc2bf7ae	3	2	toda-chi-nhanh-chinh-ban-3	available	280	0	2026-06-06 08:01:28.054203+00
e2a9ffcf-f5de-4dd2-9b18-f7adfcb397ea	d7da975e-15df-40ef-8088-f6317d809a6a	2c8114be-1e1e-47dc-8f06-6008dbaabcff	43598e64-2ddf-4f8d-94fa-ff85bc2bf7ae	4	2	toda-chi-nhanh-chinh-ban-4	available	420	0	2026-06-06 08:01:28.060671+00
c924a069-b241-4838-9678-8d6b05e7f112	d7da975e-15df-40ef-8088-f6317d809a6a	2c8114be-1e1e-47dc-8f06-6008dbaabcff	43598e64-2ddf-4f8d-94fa-ff85bc2bf7ae	5	4	toda-chi-nhanh-chinh-ban-5	available	560	0	2026-06-06 08:01:28.071386+00
39b8df03-7747-40d6-975b-28a02ea8c0d2	d7da975e-15df-40ef-8088-f6317d809a6a	2c8114be-1e1e-47dc-8f06-6008dbaabcff	43598e64-2ddf-4f8d-94fa-ff85bc2bf7ae	6	4	toda-chi-nhanh-chinh-ban-6	available	0	110	2026-06-06 08:01:28.077101+00
a8906f23-719e-4316-9d93-977c84aa9545	d7da975e-15df-40ef-8088-f6317d809a6a	2c8114be-1e1e-47dc-8f06-6008dbaabcff	054ed60c-5006-4561-bb7f-d1aeb4c8e2a0	7	4	toda-chi-nhanh-chinh-ban-7	available	140	110	2026-06-06 08:01:28.086983+00
19bec5c0-17ce-4e8b-854f-cb872416cfaa	d7da975e-15df-40ef-8088-f6317d809a6a	2c8114be-1e1e-47dc-8f06-6008dbaabcff	054ed60c-5006-4561-bb7f-d1aeb4c8e2a0	8	4	toda-chi-nhanh-chinh-ban-8	available	280	110	2026-06-06 08:01:28.093004+00
a4be148a-d9f0-4650-9519-398217e28cd0	d7da975e-15df-40ef-8088-f6317d809a6a	2c8114be-1e1e-47dc-8f06-6008dbaabcff	054ed60c-5006-4561-bb7f-d1aeb4c8e2a0	9	4	toda-chi-nhanh-chinh-ban-9	available	420	110	2026-06-06 08:01:28.102681+00
8c684e88-6886-4cc7-a912-b6c5830035b9	d7da975e-15df-40ef-8088-f6317d809a6a	2c8114be-1e1e-47dc-8f06-6008dbaabcff	054ed60c-5006-4561-bb7f-d1aeb4c8e2a0	10	4	toda-chi-nhanh-chinh-ban-10	available	560	110	2026-06-06 08:01:28.109439+00
e52a6771-4985-4b56-9cff-0f124d35e139	d7da975e-15df-40ef-8088-f6317d809a6a	2c8114be-1e1e-47dc-8f06-6008dbaabcff	054ed60c-5006-4561-bb7f-d1aeb4c8e2a0	11	4	toda-chi-nhanh-chinh-ban-11	available	0	220	2026-06-06 08:01:28.120914+00
5d82c38d-10e1-4046-bf23-347676c84e03	d7da975e-15df-40ef-8088-f6317d809a6a	2c8114be-1e1e-47dc-8f06-6008dbaabcff	054ed60c-5006-4561-bb7f-d1aeb4c8e2a0	12	4	toda-chi-nhanh-chinh-ban-12	available	140	220	2026-06-06 08:01:28.131124+00
58d81200-3a39-49a7-8624-31c4d26201bf	d7da975e-15df-40ef-8088-f6317d809a6a	2c8114be-1e1e-47dc-8f06-6008dbaabcff	9f54d605-0c9d-4680-86f5-c1c6dd6fb739	13	6	toda-chi-nhanh-chinh-ban-13	available	280	220	2026-06-06 08:01:28.138067+00
dcd92524-c149-47f0-b03b-7b9d124b47bf	d7da975e-15df-40ef-8088-f6317d809a6a	2c8114be-1e1e-47dc-8f06-6008dbaabcff	9f54d605-0c9d-4680-86f5-c1c6dd6fb739	14	6	toda-chi-nhanh-chinh-ban-14	available	420	220	2026-06-06 08:01:28.146707+00
282039cc-4070-4ace-9c79-10a844eca875	d7da975e-15df-40ef-8088-f6317d809a6a	2c8114be-1e1e-47dc-8f06-6008dbaabcff	9f54d605-0c9d-4680-86f5-c1c6dd6fb739	15	6	toda-chi-nhanh-chinh-ban-15	available	560	220	2026-06-06 08:01:28.154094+00
3a4c385e-495b-4d38-b0b3-4e2dab74fe19	d7da975e-15df-40ef-8088-f6317d809a6a	2c8114be-1e1e-47dc-8f06-6008dbaabcff	43598e64-2ddf-4f8d-94fa-ff85bc2bf7ae	1	2	toda-chi-nhanh-chinh-ban-1	available	0	0	2026-06-06 08:01:28.03621+00
\.


--
-- PostgreSQL database dump complete
--

\unrestrict aGPugIDAM2H09xVEIjylnztsHcEdRqqnqx4sO3WOwtlyJUACsS5rLRWacgucfqI

SET session_replication_role = DEFAULT;
COMMIT;
