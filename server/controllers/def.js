const express = require('express');
const router = express.Router();
const db = require('../database/database');

router.post('/defIns', (req, res) => {
  const { def_date_creat, def_date_depot, def_ministere, def_service, def_nature, def_bordereau, util_id } = req.body;
  const sqlIns = `INSERT INTO def (def_date_creat, def_date_depot, def_ministere, def_service, def_nature, def_bordereau, util_id) VALUES (?, ?, ?, ?, ?, ?, ?)`;
  db.run(sqlIns, [def_date_creat, def_date_depot, def_ministere, def_service, def_nature, def_bordereau, util_id], function (err) {
    if (err) console.error(err.message);
    else if (this.lastID) res.status(200).send("DEF no. '" + this.lastID + "' ajoutée avec succès!");
  });
});

router.get('/defSel/:annee', (req, res) => {
  const annee = req.params.annee;
  const sqlSel = `SELECT *, def_id AS id FROM def d LEFT JOIN utilisateur u ON d.util_id = u.util_id WHERE strftime('%Y', d.def_date_depot) LIKE '%' || ? || '%' ORDER BY d.def_date_depot DESC`;
  db.all(sqlSel, [annee !== 'null' ? annee : ''], (err, rows) => {
    if (err) console.error(err.message);
    else res.json(rows);
  });
});

router.get('/defAnneeSel', (req, res) => {
  const sqlSel = `SELECT strftime('%Y', def_date_depot) AS def_annee FROM def GROUP BY def_annee ORDER BY def_annee DESC`;
  db.all(sqlSel, (err, rows) => {
    if (err) console.error(err.message);
    else res.json(rows);
  });
});

// Traitement pour l'affichage des def par mois
router.get('/defByMonthSel', (req, res) => {
  const sqlSel = `SELECT strftime('%m/%Y', def_date_depot) AS month, COUNT(strftime('%m/%Y', def_date_depot)) AS count FROM def GROUP BY strftime('%m/%Y', def_date_depot) ORDER BY def_date_depot LIMIT 12`;
  db.all(sqlSel, (err, rows) => {
    if (err) console.error(err.message);
    else res.json(rows);
  });
});

router.put('/defUpd/:id', (req, res) => {
  const def_id = req.params.id;
  const { def_date_creat, def_date_depot, def_ministere, def_service, def_nature, def_bordereau, util_id } = req.body;
  const sqlUpd = `UPDATE def SET def_date_creat = ?, def_date_depot = ?, def_ministere = ?, def_service = ?, def_nature = ?, def_bordereau = ?, util_id = ? WHERE def_id = ?`;
  db.run(sqlUpd, [def_date_creat, def_date_depot, def_ministere, def_service, def_nature, def_bordereau, util_id, def_id], function (err) {
    if (err) console.error(err.message);
    else if (this.changes > 0) res.status(200).send("DEF no. '" + def_id + "' modifiée avec succès!");
  });
});

router.put('/defDegagement/:id', (req, res) => {
  const def_id = req.params.id;
  const { def_observation, util_id } = req.body;
  const sqlUpd = `UPDATE def SET def_observation = ?, util_id = ? WHERE def_id = ?`;
  db.run(sqlUpd, [def_observation, util_id, def_id], function (err) {
    if (err) console.error(err.message);
    else if (this.changes > 0) res.status(200).send("DEF no. '" + def_id + "' dégagée avec succès!");
  });
});

router.delete('/defDel/:id', (req, res) => {
  const def_id = req.params.id;
  const sqlDel = `DELETE FROM def WHERE def_id = ?`;
  db.run(sqlDel, [def_id], function (err) {
    if (err) console.error(err.message);
    else if (this.changes > 0) res.status(200).send("DEF no. '" + def_id + "' supprimée avec succès!");
  });
});

module.exports = router;