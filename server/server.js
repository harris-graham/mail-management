const express = require('express');
const bodyParser = require('body-parser');
const jwt = require('jsonwebtoken');
const cors = require('cors');

const app = express();
app.use(bodyParser.json());
app.use(cors());
const PORT = 5000;

const db = require('./database/database');

const corrRoutes = require('./controllers/correspondance');
const natRoutes = require('./controllers/nature');
const consRoutes = require('./controllers/consultation');
const defRoutes = require('./controllers/def');
const arcRoutes = require('./controllers/archive');
const utilRoutes = require('./controllers/utilisateur');

app.use(corrRoutes, natRoutes, consRoutes, defRoutes, arcRoutes, utilRoutes);

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});

const SECRET_KEY = '0snhx5IVqG7C0qbjAquCIugSsyNGUFQ5FvBYzbj4';

// Fonction de création de la session utilisateur qui durera 1 jour
function generateToken(user) {
  return jwt.sign({ util_id: user.util_id, util_nom_util: user.util_nom_util, util_type: user.util_type }, SECRET_KEY, { expiresIn: '1d' });
}

app.post('/login', (req, res) => {
  const { nom_util, mdp } = req.body;
  // Vérification des identifiants de l'utilisateur
  db.get('SELECT * FROM utilisateur WHERE util_nom_util = ? AND util_mdp = ?', [nom_util, mdp], (err, util) => {
    if (util) {
      // Création de la session utilisateur
      const token = generateToken(util);
      return res.status(200).json({ token });
    } else if (util === undefined) {
      return res.status(299).send('Informations d\'identification invalides');
    } else {
      return res.status(401).send();
    }
  });
});

// Fonction de validation de la session de l'utilisateur
function validateToken(req, res, next) {
  const token = req.headers['authorization'];
  if (!token) {
    return res.status(401).json({ message: 'No token provided.' });
  }
  // Vérification des informations de connexion de l'utilisateur
  jwt.verify(token, SECRET_KEY, (err, decoded) => {
    if (err) {
      return res.status(401).json({ message: 'Invalid token.' });
    }
    // Envoie des informations de l'utilisateur
    req.util = decoded;
    next();
  });
}

// Envoie de l'autorisation de la session à l'utilisateur
app.get('/protected', validateToken, (req, res) => {
  return res.status(200).json({ message: 'This is a protected route.', util: req.util });
});