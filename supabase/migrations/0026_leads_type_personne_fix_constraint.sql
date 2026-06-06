-- Réconcilie le CHECK constraint avec les valeurs attendues par le code.
-- Ajout de 'physique'/'morale' (alias LLM) + changement du défaut.
ALTER TABLE leads DROP CONSTRAINT leads_type_personne_check;
ALTER TABLE leads ADD CONSTRAINT leads_type_personne_check
  CHECK (type_personne = ANY (ARRAY[
    'particulier','professionnel','societe','sci','agence','physique','morale'
  ]));
ALTER TABLE leads ALTER COLUMN type_personne SET DEFAULT 'particulier';
