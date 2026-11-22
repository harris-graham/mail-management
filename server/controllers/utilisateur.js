const express = require('express');
const router = express.Router();
const db = require('../database/database');

// Traitement pour l'ajout d'un nouvel utilisateur
router.post('/utilIns', (req, res) => {
  const { util_id, util_nom_util, util_mdp, util_type } = req.body;
  const sqlIns = `INSERT INTO utilisateur (util_id, util_nom_util, util_mdp, util_type) VALUES (?, ?, ?, ?)`;
  db.run(sqlIns, [util_id, util_nom_util, util_mdp, util_type], function (err) {
    if (err) console.error(err.message);
    else res.status(200).send("Utilisateur no. '" + util_id + "' ajoutée avec succès!");
  });
});

// Traitement pour l'affichage de la liste des utilisateurs
router.get('/utilSel', (req, res) => {
  const sqlSel = `SELECT *, util_id AS id FROM utilisateur`;
  db.all(sqlSel, (err, rows) => {
    if (err) console.error(err.message);
    else res.json(rows);
  });
});

router.get('/utilCheck/:id', (req, res) => {
  const util_id = req.params.id;
  const sqlSel = `SELECT * FROM utilisateur WHERE util_id = ?`;
  db.all(sqlSel, [util_id], (err, rows) => {
    if (err) console.error(err.message);
    else res.json(rows);
  });
});

// Traitement pour la modification d'un utilisateur existant
router.put('/utilUpd/:old_id', (req, res) => {
  const old_id = req.params.old_id;
  const { util_id, util_nom_util, util_mdp, util_type } = req.body;
  const sqlUpd = `UPDATE utilisateur SET util_id = ?, util_nom_util = ?, util_mdp = ?, util_type = ? WHERE util_id = ?`;
  db.run(sqlUpd, [util_id, util_nom_util, util_mdp, util_type, old_id], function (err) {
    if (err) console.error(err.message);
    else if (this.changes > 0) res.status(200).send("Utilisateur no. '" + old_id + "' modifiée avec succès!");
  });
});

// Traitement pour la suppression d'un utilisateur
router.delete('/utilDel/:id', (req, res) => {
  const util_id = req.params.id;
  const sqlDel = `DELETE FROM utilisateur WHERE util_id = ?`;
  db.run(sqlDel, [util_id], function (err) {
    if (err) console.error(err.message);
    else if (this.changes > 0) res.status(200).send("Utilisateur no. '" + util_id + "' supprimée avec succès!");
  });
});

module.exports = router;