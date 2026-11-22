const express = require('express');
const router = express.Router();
const db = require('../database/database');

// Traitement pour l'ajout d'une nouvelle nature
router.post('/natIns', (req, res) => {
  const { nat_nom } = req.body;
  // Vérification de l'existance de la catégorie qui doit être unique
  const sqlSel = `SELECT * FROM nature WHERE nat_nom = ?`;
  db.get(sqlSel, [nat_nom], (err, row) => {
    if (err) console.error(err.message);
    else {
      const exists = row !== undefined;
      if (exists === false) {
        // Ajout d'une nouvelle nature si elle n'existe pas
        const sqlIns = `INSERT INTO nature (nat_nom) VALUES (?)`;
        db.run(sqlIns, [nat_nom], function (err) {
          if (err) console.error(err.message);
          else if (this.lastID) res.status(200).json({ id: this.lastID, message: "Nature no. '" + this.lastID + "' ajoutée avec succès!" });
        });
      } else {
        res.status(299).send('La nature existe déjà!');
      }
    }
  });
});

// Traitement pour l'affichage de la liste des natures
router.get('/natSel', (req, res) => {
  const sqlSel = `SELECT *, nat_id AS id FROM nature`;
  db.all(sqlSel, (err, rows) => {
    if (err) console.error(err.message);
    else res.json(rows);
  });
});

// Traitement pour la modification d'une nature existante
router.put('/natUpd/:id', (req, res) => {
  const nat_id = req.params.id;
  const { nat_nom } = req.body;
  // Vérification de l'existance de la catégorie
  const sqlSel = `SELECT * FROM nature WHERE nat_nom = ?`;
  db.get(sqlSel, [nat_nom], (err, row) => {
    if (err) console.error(err.message);
    else {
      const exists = row !== undefined;
      if (exists === false) {
        // Modification de la sous-catégorie de la nature
        const sqlUpd = `UPDATE nature SET nat_nom = ? WHERE nat_id = ?`;
        db.run(sqlUpd, [nat_nom, nat_id], function (err) {
          if (err) console.error(err.message);
          else if (this.changes > 0) res.status(200).send("Nature no. '" + nat_id + "' modifiée avec succès!");
        });
      } else {
        res.status(299).send("La nature existe déjà!");
      }
    }
  });
});

//Traitement pour la suppression d'une nature
router.delete('/natCatDel/:id', (req, res) => {
  const nat_id = req.params.id;
  const sqlDel = `DELETE FROM nature WHERE nat_id = ?`;
  db.run(sqlDel, [nat_id], function (err) {
    if (err) console.error(err.message);
    else if (this.changes > 0) res.status(200).send("Nature no. '" + nat_id + "' supprimée avec succès!");
  });
});

module.exports = router;