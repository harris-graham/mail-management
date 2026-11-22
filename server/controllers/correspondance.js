const express = require('express');
const router = express.Router();
const db = require('../database/database');

// Traitement pour l'ajout d'un nouveau courrier de correspondance
router.post('/corrIns', (req, res) => {
  const { corr_date_creat, corr_date_depot, corr_ministere, corr_service, nat_id, corr_analyse, corr_bordereau, util_id } = req.body;
  const sqlIns = `INSERT INTO correspondance (corr_date_creat, corr_date_depot, corr_ministere, corr_service, nat_id, corr_analyse, corr_bordereau, util_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`;
  db.run(sqlIns, [corr_date_creat, corr_date_depot, corr_ministere, corr_service, nat_id, corr_analyse, corr_bordereau, util_id], function (err) {
    if (err) console.error(err.message);
    else if (this.lastID) res.status(200).send("Correspondance no. '" + this.lastID + "' ajoutée avec succès!");
  });
});

// Traitement pour l'affichage de la liste des courriers de correspondance par année
router.get('/corrSel/:annee', (req, res) => {
  const annee = req.params.annee;
  const sqlSel = `SELECT *, corr_id AS id FROM correspondance c LEFT JOIN nature n ON c.nat_id = n.nat_id LEFT JOIN utilisateur u ON c.util_id = u.util_id WHERE strftime('%Y', c.corr_date_depot) LIKE '%' || ? || '%' ORDER BY c.corr_date_depot DESC`;
  db.all(sqlSel, [annee !== 'null' ? annee : ''], (err, rows) => {
    if (err) console.error(err.message);
    else res.json(rows);
  });
});

router.get('/corrAnneeSel', (req, res) => {
  const sqlSel = `SELECT strftime('%Y', corr_date_depot) AS corr_annee FROM correspondance GROUP BY corr_annee ORDER BY corr_annee DESC`;
  db.all(sqlSel, (err, rows) => {
    if (err) console.error(err.message);
    else res.json(rows);
  });
});

// Traitement pour l'affichage des courriers de correspondance par mois
router.get('/corrByMonthSel', (req, res) => {
  const sqlSel = `SELECT strftime('%m/%Y', corr_date_depot) AS month, COUNT(strftime('%m/%Y', corr_date_depot)) AS count FROM correspondance WHERE month IS NOT NULL GROUP BY strftime('%m/%Y', corr_date_depot) LIMIT 12`;
  db.all(sqlSel, (err, rows) => {
    if (err) console.error(err.message);
    else res.json(rows);
  });
});

// Traitement pour la modification d'un courrier de correspondance existant
router.put('/corrUpd/:id', (req, res) => {
  const corr_id = req.params.id;
  const { corr_date_creat, corr_date_depot, corr_ministere, corr_service, nat_id, corr_analyse, corr_bordereau, util_id } = req.body;
  const sqlUpd = `UPDATE correspondance SET corr_date_creat = ?, corr_date_depot = ?, corr_ministere = ?, corr_service = ?, nat_id = ?, corr_analyse = ?, corr_bordereau = ?, util_id = ? WHERE corr_id = ?`;
  db.run(sqlUpd, [corr_date_creat, corr_date_depot, corr_ministere, corr_service, nat_id, corr_analyse, corr_bordereau, util_id, corr_id], function (err) {
    if (err) console.error(err.message);
    else if (this.changes > 0) res.status(200).send("Correspondance no. '" + corr_id + "' modifiée avec succès!");
  });
  console.log(this.changes);
});

// Traitement pour un marquage en tant que visé d'un courrier de correspondance existant
router.put('/corrVisa/:id', (req, res) => {
  const corr_id = req.params.id;
  const { corr_date_decision, corr_projet_vise, corr_observation, util_id } = req.body;
  // Mise à jour en tant que visé avec date de décision et projet visé d'un courrier de correspondance existant
  const sqlUpd = `UPDATE correspondance SET corr_date_decision = ?, corr_projet_vise = ?, corr_observation = ?, util_id = ? WHERE corr_id = ?`;
  db.run(sqlUpd, [corr_date_decision, corr_projet_vise, corr_observation, util_id, corr_id], function (err) {
    if (err) console.error(err.message);
    else if (this.changes > 0) {
      // Envoie du courrier de correspondance vers l'archive après le marquage
      const sqlIns = `INSERT INTO archive SELECT * FROM correspondance WHERE corr_id = ?`;
      db.run(sqlIns, [corr_id], function (err) {
        if (err) console.error(err.message);
        else if (this.lastID) res.status(200).send("Correspondance no. '" + this.lastID + "' visée avec succès!");
      });
    }
  });
});

// Traitement pour un marquage en tant que rejeté d'un courrier de correspondance existant
router.put('/corrRejet/:id', (req, res) => {
  const corr_id = req.params.id;
  const { corr_observation, util_id } = req.body;
  // Mise à jour en tant que rejeté d'un courrier de correspondance existant
  const sqlUpd = `UPDATE correspondance SET corr_observation = ?, util_id = ? WHERE corr_id = ?`;
  db.run(sqlUpd, [corr_observation, util_id, corr_id], function (err) {
    if (err) console.error(err.message);
    else if (this.changes > 0) {
      // Envoie du courrier de correspondance vers l'archive après le marquage
      const sqlIns = `INSERT INTO archive SELECT * FROM correspondance WHERE corr_id = ?`;
      db.run(sqlIns, [corr_id], function (err) {
        if (err) console.error(err.message);
        else if (this.lastID) res.status(200).send("Correspondance no. '" + this.lastID + "' rejetée avec succès!");
      });
    }
  });
});

// Traitement pour la suppression d'un courrier de correspondance
router.delete('/corrDel/:id', (req, res) => {
  const corr_id = req.params.id;
  const sqlDel = `DELETE FROM correspondance WHERE corr_id = ?`;
  db.run(sqlDel, [corr_id], function (err) {
    if (err) console.error(err.message);
    else if (this.changes > 0) res.status(200).send("Correspondance no. '" + corr_id + "' supprimée avec succès!");
  });
});

module.exports = router;