import * as path from 'node:path';
import * as url from 'node:url';

import { default as express } from 'express';
import { default as sqlite3 } from 'sqlite3';

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));
const db_filename = path.join(__dirname, 'db', 'stpaul_crime.sqlite3');

const port = 8000;

let app = express();
app.use(express.json());

/********************************************************************
***    DATABASE FUNCTIONS                                         *** 
********************************************************************/
// Open SQLite3 database (in read-write mode)
let db = new sqlite3.Database(db_filename, sqlite3.OPEN_READWRITE, (err) => {
    if (err) {
        console.log('Error opening ' + path.basename(db_filename));
    }
    else {
        console.log('Now connected to ' + path.basename(db_filename));
    }
});

// Create Promise for SQLite3 database SELECT query 
function dbSelect(query, params) {
    return new Promise((resolve, reject) => {
        db.all(query, params, (err, rows) => {
            if (err) {
                reject(err);
            }
            else {
                resolve(rows);
            }
        });
    });
}

// Create Promise for SQLite3 database INSERT or DELETE query
function dbRun(query, params) {
    return new Promise((resolve, reject) => {
        db.run(query, params, (err) => {
            if (err) {
                reject(err);
            }
            else {
                resolve();
            }
        });
    });
}

/********************************************************************
***    REST REQUEST HANDLERS                                      *** 
********************************************************************/
// GET request handler for crime codes
app.get('/codes', (req, res) => {
    console.log(req.query); // query object (key-value pairs after the ? in the url)
    let query = 'SELECT code, incident_type as type FROM Codes';
    if (req.query.code != undefined) {
        query = query + ' WHERE code IN ('+req.query.code+')';
    };
    query = query + ' ORDER BY code';
    dbSelect(query)
        .then((rows) => {
            res.status(200).type('json').json(rows);
        })
        .catch((error) => {
            res.status(500).type('txt').send(error);
        })
});

// GET request handler for neighborhoods
app.get('/neighborhoods', (req, res) => {
    console.log(req.query); // query object (key-value pairs after the ? in the url)
    let query = 'SELECT neighborhood_number as id, neighborhood_name as name FROM Neighborhoods';
    if (req.query.id != undefined) {
        query = query + ' WHERE neighborhood_number IN ('+req.query.id+')';
    };
    query = query + ' ORDER BY id';

    dbSelect(query)
        .then((rows) => {
            res.status(200).type('json').json(rows);
        })
        .catch((error) => {
            console.error(error);
            res.status(500).send('Internal Server Error');
        })
});

// GET request handler for crime incidents
app.get('/incidents', (req, res) => {
    console.log(req.query); // query object (key-value pairs after the ? in the url)
    let query = 'SELECT case_number, strftime("%Y-%m-%d", date_time) as date, strftime("%H:%M:%S", date_time) as time, code, incident, police_grid, neighborhood_number, block FROM Incidents WHERE code > -100'; // adjust the limit as needed

    if (req.query.neighborhood != undefined) {
        query = query + ' AND neighborhood_number IN ('+req.query.neighborhood+')';
    };
    if (req.query.code != undefined) {
        query = query + ' AND code IN ('+req.query.code+')';
    };

    if (req.query.grid != undefined ) {
        query = query + ' AND police_grid IN ('+req.query.grid+')';
    };

    if (req.query.start_date != undefined ) {
        query = query + ' AND date_time > "'+req.query.start_date+'"';
    };

    if (req.query.end_date != undefined ) {
        query = query + ' AND date_time < "'+req.query.end_date+'"';
    };

    if (req.query.limit != undefined) {
        query = query + ' ORDER BY date_time DESC LIMIT '+req.query.limit;
    } else {
        query = query + ' ORDER BY date_time DESC LIMIT 500';
    };

    if (query.includes("AND")) {
        query = query.replace('code > -100 AND ','');
    } else {
        query = query.replace(' WHERE code > -100', '');
    }

    //console.log(query);
    dbSelect(query)
        .then((rows) => {
            res.status(200).type('json').json(rows);
        })
        .catch((error) => {
            console.error(error);
            res.status(500).send('Internal Server Error');
        })
});

// PUT request handler for new crime incident
app.put('/new-incident', (req, res) => {
    console.log(req.body); // uploaded data
    const {case_number, date, time, code, incident, police_grid, neighborhood_number, block} = req.body;
 
    const incidentData = [case_number, date, time, code, incident, police_grid, neighborhood_number,block];

    db.get("SELECT COUNT(*) AS count FROM Incidents WHERE case_number=?", [case_number], (err, { count }) => {
        if (err) {
            console.log("Error checking incident existence: " + err);
            res.status(500).send('Internal Server Error');
        } else {
            if (count === 0) {
                db.run("INSERT INTO Incidents (case_number, date_time, code, incident, police_grid, neighborhood_number, block) VALUES (?, ?, ?, ?, ?, ?, ?)", incidentData, (err) => {
                    if (err) {
                        console.log("Error entering incident: " + err);
                        res.status(500).send('Internal Server Error');
                    } else {
                        res.status(200).send('Success!');
                    }
                });
            } else {
                res.status(500).send('Error: incident already exists');
            }
        }
    });
});

// DELETE request handler for new crime incident
app.delete('/remove-incident', (req, res) => {

   //curl -X DELETE "http://localhost:8000/remove-incident" -H "Content-Type: application/json" -d "{\"case_number\": \"23200821\"}"
    var { case_number } = req.body;
    db.get('SELECT COUNT(*) AS count FROM Incidents WHERE case_number = ?', [case_number], (err, { count }) => {
        if (err) {
            console.log("There was an error " +err );
            res.status(500).send('Internal Server Error');
        }
        else {
            if (count === 0) {
                res.status(500).send('The case does not exist');
            }
            else {
                db.run('DELETE FROM Incidents WHERE case_number = ?', [case_number], (err) => {
                    if (err) {
                        res.status(500).send('There was an error');
                    }
                    else {
                        res.status(200).send('You successfully deleted the incident');
                    }
                });
            }
        }
    });
});

/********************************************************************
***    START SERVER                                               *** 
********************************************************************/
// Start server - listen for client connections
app.listen(port, () => {
    console.log('Now listening on port ' + port);
});
