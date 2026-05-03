const express = require('express');
const app = express();

const api = express.Router();
api.get('/trips', (req, res) => res.send('trips'));

const auth = express.Router();
auth.post('/login', (req, res) => res.send('login'));

app.use('/api', api);
app.use('/api/auth', auth);

app.post('/api/auth/login', (req, res, next) => {
    console.log('hit main app');
    next();
});
app.listen(5001, () => console.log('started'));
