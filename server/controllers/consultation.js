const express = require('express');
const router = express.Router();
const db = require('../database/database');

router.post('/consIns', (req, res) => {
  const { cons_date_arrive, cons_description, cons_origine, cons_date_affichage, cons_date_pli, util_id } = req.body;
  const sqlIns = `INSERT INTO consultation (cons_date_arrive, cons_description, cons_origine, cons_date_affichage, cons_date_pli, util_id) VALUES (?, ?, ?, ?, ?, ?)`;
  db.run(sqlIns, [cons_date_arrive, cons_description, cons_origine, cons_date_affichage, cons_date_pli, util_id], function (err) {
    if (err) console.error(err.message);
    else if (this.lastID) res.status(200).send("Consultation no. '" + this.lastID + "' ajoutée avec succès!");
  });
});

router.get('/consSel/:annee', (req, res) => {
  const annee = req.params.annee;
  const sqlSel = `SELECT *, cons_id AS id FROM consultation c LEFT JOIN utilisateur u ON c.util_id = u.util_id WHERE strftime('%Y', c.cons_date_arrive) LIKE '%' || ? || '%' ORDER BY c.cons_date_arrive DESC`;
  db.all(sqlSel, [annee !== 'null' ? annee : ''], (err, rows) => {
    if (err) console.error(err.message);
    else res.json(rows);
  });
});

router.get('/consAnneeSel', (req, res) => {
  const sqlSel = `SELECT strftime('%Y', cons_date_arrive) AS cons_annee FROM consultation GROUP BY cons_annee ORDER BY cons_annee DESC`;
  db.all(sqlSel, (err, rows) => {
    if (err) console.error(err.message);
    else res.json(rows);
  });
});

// Traitement pour l'affichage des consultation par mois
router.get('/consByMonthSel', (req, res) => {
  const sqlSel = `SELECT strftime('%m/%Y', cons_date_arrive) AS month, COUNT(strftime('%m/%Y', cons_date_arrive)) AS count FROM consultation GROUP BY strftime('%m/%Y', cons_date_arrive) ORDER BY cons_date_arrive LIMIT 12`;
  db.all(sqlSel, (err, rows) => {
    if (err) console.error(err.message);
    else res.json(rows);
  });
});

router.put('/consUpd/:id', (req, res) => {
  const cons_id = req.params.id;
  const { cons_date_arrive, cons_description, cons_origine, cons_date_affichage, cons_date_pli, util_id } = req.body;
  const sqlUpd = `UPDATE consultation SET cons_date_arrive = ?, cons_description = ?, cons_origine = ?, cons_date_affichage = ?, cons_date_pli = ?, util_id = ? WHERE cons_id = ?`;
  db.run(sqlUpd, [cons_date_arrive, cons_description, cons_origine, cons_date_affichage, cons_date_pli, util_id, cons_id], function (err) {
    if (err) console.error(err.message);
    else if (this.changes > 0) res.status(200).send("Consultation no. '" + cons_id + "' modifiée avec succès!");
  });
});

router.delete('/consDel/:id', (req, res) => {
  const cons_id = req.params.id;
  const sqlDel = `DELETE FROM consultation WHERE cons_id = ?`;
  db.run(sqlDel, [cons_id], function (err) {
    if (err) console.error(err.message);
    else if (this.changes > 0) res.status(200).send("Consultation no. '" + cons_id + "' supprimée avec succès!");
  });
});

module.exports = router;