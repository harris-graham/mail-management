const express = require('express');
const router = express.Router();
const db = require('../database/database');

router.get('/archSel/:annee', (req, res) => {
  const annee = req.params.annee;
  const sqlSel = `SELECT a.*, n.*, u.*, c.corr_id, arch_id AS id FROM archive a LEFT JOIN nature n ON a.nat_id = n.nat_id LEFT JOIN utilisateur u ON a.util_id = u.util_id LEFT JOIN correspondance c ON a.arch_id = c.corr_id WHERE strftime('%Y', a.arch_date_depot) LIKE '%' || ? ||'%' ORDER BY a.arch_date_depot DESC`;
  db.all(sqlSel, [annee !== 'null' ? annee : ''], (err, rows) => {
    if (err) console.error(err.message);
    else res.json(rows);
  });
});

router.get('/archAnneeSel', (req, res) => {
  const sqlSel = `SELECT strftime('%Y', arch_date_depot) AS arch_annee FROM archive GROUP BY arch_annee ORDER BY arch_annee DESC`;
  db.all(sqlSel, (err, rows) => {
    if (err) console.error(err.message);
    else res.json(rows);
  });
});

// Traitement pour la restauration d'un courrier de correspondance
router.post('/archRestore/:id', (req, res) => {
  const arch_id = req.params.id;
  // Envoie de l'archive vers la liste de courrier de correspondance
  const sqlIns = `INSERT INTO correspondance SELECT * FROM archive WHERE arch_id = ?`;
  db.run(sqlIns, [arch_id], function (err) {
    if (err) console.error(err.message);
    else if (this.lastID) res.status(200).send("Archive no. '" + this.lastID + "' restorée avec succès!");
  });
});

module.exports = router;