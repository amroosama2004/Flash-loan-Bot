// server.js — simple keep-alive HTTP endpoint
const express = require('express');
const app = express();

app.get('/', (req, res) => res.send('OK'));

const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`⭐ Keepalive server running on port ${port}`);
});
