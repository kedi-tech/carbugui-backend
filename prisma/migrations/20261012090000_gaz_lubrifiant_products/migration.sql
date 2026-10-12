-- CARBUGUI suit désormais 4 produits : essence, gasoil, gaz (butane) et
-- lubrifiant. Élargir un ENUM MySQL ne touche pas aux lignes existantes.
ALTER TABLE `station_products` MODIFY `product` ENUM('ESSENCE', 'GASOIL', 'GAZ', 'LUBRIFIANT') NOT NULL;
ALTER TABLE `station_activities` MODIFY `product` ENUM('ESSENCE', 'GASOIL', 'GAZ', 'LUBRIFIANT') NULL;
ALTER TABLE `station_reports` MODIFY `product` ENUM('ESSENCE', 'GASOIL', 'GAZ', 'LUBRIFIANT') NULL;
ALTER TABLE `search_events` MODIFY `product` ENUM('ESSENCE', 'GASOIL', 'GAZ', 'LUBRIFIANT') NOT NULL;
