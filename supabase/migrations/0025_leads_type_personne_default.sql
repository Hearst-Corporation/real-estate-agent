-- type_personne était NOT NULL sans défaut → inserts sans ce champ échouaient silencieusement.
ALTER TABLE leads ALTER COLUMN type_personne SET DEFAULT 'physique';
