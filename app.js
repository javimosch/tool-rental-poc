const express = require('express');
const session = require('express-session');
const bodyParser = require('body-parser');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const ejs = require('ejs');

const app = express();
const db = new sqlite3.Database(':memory:');

// Middleware
app.use(bodyParser.urlencoded({ extended: true }));
app.use(session({
  secret: 'tool-rental-secret',
  resave: false,
  saveUninitialized: true
}));

// Configure EJS
app.engine('ejs', ejs.renderFile);
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Calculate commission based on daily rate
function calculateCommission(dailyRate) {
  // Base commission of 2 EUR for items under 30 EUR
  // 5 EUR for items between 30-50 EUR
  // 10 EUR for items over 50 EUR
  if (dailyRate <= 30) return 2;
  if (dailyRate <= 50) return 5;
  return 10;
}

// Database initialization
db.serialize(() => {
  db.run(`
    CREATE TABLE IF NOT EXISTS tools (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      description TEXT,
      daily_rate DECIMAL(10,2) NOT NULL,
      available BOOLEAN DEFAULT 1
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS rentals (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      tool_id INTEGER,
      renter_name TEXT NOT NULL,
      start_date DATE NOT NULL,
      end_date DATE NOT NULL,
      total_amount DECIMAL(10,2) NOT NULL,
      commission DECIMAL(10,2) NOT NULL,
      FOREIGN KEY (tool_id) REFERENCES tools(id)
    )
  `);

  // Add some sample tools
  db.run(`INSERT INTO tools (name, description, daily_rate) VALUES 
    ('Power Drill', 'Professional grade power drill with multiple attachments', 25.00),
    ('Lawn Mower', 'Gas-powered lawn mower, perfect for medium-sized lawns', 45.00),
    ('Pressure Washer', 'High-pressure water cleaner for outdoor surfaces', 35.00)`);
});

// Routes
app.get('/', (req, res) => {
  db.all('SELECT * FROM tools', [], (err, tools) => {
    if (err) {
      console.error(err);
      return res.status(500).send('Database error');
    }
    res.render('index', { tools });
  });
});

app.get('/tools/new', (req, res) => {
  res.render('new-tool');
});

app.post('/tools', (req, res) => {
  const { name, description, daily_rate } = req.body;
  db.run(
    'INSERT INTO tools (name, description, daily_rate) VALUES (?, ?, ?)',
    [name, description, daily_rate],
    (err) => {
      if (err) {
        console.error(err);
        return res.status(500).send('Database error');
      }
      res.redirect('/');
    }
  );
});

app.get('/rent/:id', (req, res) => {
  db.get('SELECT * FROM tools WHERE id = ?', [req.params.id], (err, tool) => {
    if (err) {
      console.error(err);
      return res.status(500).send('Database error');
    }
    const commission = calculateCommission(tool.daily_rate);
    res.render('rent', { tool, commission });
  });
});

app.post('/rent/:id', (req, res) => {
  const { renter_name, start_date, end_date } = req.body;
  const toolId = req.params.id;

  db.get('SELECT * FROM tools WHERE id = ?', [toolId], (err, tool) => {
    if (err) {
      console.error(err);
      return res.status(500).send('Database error');
    }

    const start = new Date(start_date);
    const end = new Date(end_date);
    const days = Math.ceil((end - start) / (1000 * 60 * 60 * 24));
    const commission = calculateCommission(tool.daily_rate);
    const total_amount = (days * tool.daily_rate) + commission;

    db.run(
      'INSERT INTO rentals (tool_id, renter_name, start_date, end_date, total_amount, commission) VALUES (?, ?, ?, ?, ?, ?)',
      [toolId, renter_name, start_date, end_date, total_amount, commission],
      (err) => {
        if (err) {
          console.error(err);
          return res.status(500).send('Database error');
        }

        db.run(
          'UPDATE tools SET available = 0 WHERE id = ?',
          [toolId],
          (err) => {
            if (err) {
              console.error(err);
              return res.status(500).send('Database error');
            }
            res.redirect('/');
          }
        );
      }
    );
  });
});

app.get('/rentals', (req, res) => {
  db.all(
    `SELECT rentals.*, tools.name as tool_name
     FROM rentals
     JOIN tools ON rentals.tool_id = tools.id`,
    [],
    (err, rentals) => {
      if (err) {
        console.error(err);
        return res.status(500).send('Database error');
      }
      res.render('rentals', { rentals });
    }
  );
});

app.get('/association', (req, res) => {
  db.all(
    `SELECT 
      COUNT(*) as total_rentals,
      SUM(commission) as total_commission,
      strftime('%Y-%m', start_date) as month
     FROM rentals
     GROUP BY month
     ORDER BY month DESC`,
    [],
    (err, stats) => {
      if (err) {
        console.error(err);
        return res.status(500).send('Database error');
      }
      res.render('association', { stats });
    }
  );
});

const PORT = 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});