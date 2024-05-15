const express = require("express");
const path = require("path");
const { open } = require("sqlite");
const sqlite3 = require("sqlite3");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");

const dbPath = path.join(__dirname, "covid19IndiaPortal.db");
const app = express();

app.use(express.json());

let db = null;

const initializeDBAndServer = async () => {
  try {
    db = await open({ filename: dbPath, driver: sqlite3.Database });
    app.listen(3000, () => {
      console.log("Server Running at http://localhost:3000/");
    });
  } catch (e) {
    console.log(`DB Error: ${e.message}`);
    process.exit(-1);
  }
};
initializeDBAndServer();
//Converting state information

const convertStateElements = (object) => {
  return {
    stateId: object.state_id,
    stateName: object.state_name,
    population: object.population,
  };
};
//Converting District information
const convertDistrictElements = (object) => {
  return {
    districtId: object.district_id,
    districtName: object.district_name,
    stateId: object.state_id,
    cases: object.cases,
    cured: object.cured,
    active: object.active,
    deaths: object.deaths,
  };
};
//Creating MiddleWare Function
const authenticateToken = async (request, response, next) => {
  let jwtToken;
  const authHeader = request.headers["authorization"];
  if (authHeader !== undefined) {
    jwtToken = authHeader.split(" ")[1];
  }
  if (jwtToken === undefined) {
    response.status(401);
    response.send("Invalid JWT Token");
  } else {
    jwt.verify(jwtToken, "MY_SECRET_TOKEN", async (error, payload) => {
      if (error) {
        response.status(401);
        response.send("Invalid JWT Token");
      } else {
        request.username = payload.username;
        next();
      }
    });
  }
};

//
app.post("/login/", async (request, response) => {
  const { username, password } = request.body;
  const selectUserQuery = `SELECT * FROM user WHERE username = '${username}'`;
  const dbUser = await db.get(selectUserQuery);
  if (dbUser === undefined) {
    response.status(400);
    response.send("Invalid user");
  } else {
    const isPasswordMatched = await bcrypt.compare(password, dbUser.password);
    if (isPasswordMatched === true) {
      const payload = {
        username: username,
      };
      const jwtToken = jwt.sign(payload, "MY_SECRET_TOKEN");
      response.send({ jwtToken });
    } else {
      response.status(400);
      response.send("Invalid password");
    }
  }
});

//
app.get("/profile/", authenticateToken, async (request, response) => {
  const { username } = request;
  const selectUserQuery = `SELECT * FROM  user WHERE username = '${username}';`;
  const dbUser = await db.all(selectUserQuery);
  response.send(dbUser);
});
//Creating new District in district table
app.post("/districts/", authenticateToken, async (request, response) => {
  const { districtName, stateId, cases, cured, active, deaths } = request.body;
  const createDistrictQuery = `
      INSERT INTO 
        district (district_name, state_id, cases, cured, active,deaths) 
      VALUES 
        (
          '${districtName}', 
          ${stateId},
          ${cases},
          ${cured},
          ${active},
          ${deaths}
        )`;
  await db.run(createDistrictQuery);
  response.send(`District Successfully Added`);
});

//Getting Districts with district ID
app.get(
  "/districts/:districtId/",
  authenticateToken,
  async (request, response) => {
    const { districtId } = request.params;
    const selectStateQuery = `SELECT * FROM  district WHERE district_id = '${districtId}';`;
    const dbState = await db.get(selectStateQuery);
    response.send(convertDistrictElements(dbState));
  }
);
// Getting states
app.get("/states/", authenticateToken, async (request, response) => {
  const selectUserQuery = `SELECT * FROM  state;`;
  const dbUser = await db.all(selectUserQuery);

  response.send(dbUser.map(convertStateElements));
});
//Getting state with ID
app.get("/states/:stateId/", authenticateToken, async (request, response) => {
  const { stateId } = request.params;
  const selectStateQuery = `SELECT * FROM  state WHERE state_id = '${stateId}';`;
  const dbState = await db.get(selectStateQuery);
  response.send(convertStateElements(dbState));
});

// Delete District
app.delete(
  "/districts/:districtId/",
  authenticateToken,
  async (request, response) => {
    const { districtId } = request.params;
    const deleteDistrictQuery = `
  DELETE FROM
    district
  WHERE
    district_id = ${districtId};`;
    await db.run(deleteDistrictQuery);
    response.send("District Removed");
  }
);

//Updates the details of a specific district based on the district ID
app.put(
  "/districts/:districtId/",
  authenticateToken,
  async (request, response) => {
    const {
      districtName,
      stateId,
      cases,
      cured,
      active,
      deaths,
    } = request.body;

    const { districtId } = request.params;
    const updateDistrictQuery = `
        UPDATE
            district
        SET
            district_name = '${districtName}',
            state_id = ${stateId},
            cases = ${cases},
            cured = ${cured},
            active = ${active},
            deaths = ${deaths}
        WHERE
            district_id = ${districtId};`;

    await db.run(updateDistrictQuery);
    response.send("District Details Updated");
  }
);

//Returns the statistics of total cases, cured, active,
// deaths of a specific state based on state ID
app.get(
  "/states/:stateId/stats/",
  authenticateToken,
  async (request, response) => {
    const { stateId } = request.params;
    const stateDistrictQuery = `
        SELECT  
            SUM(cases) as totalCases,
            SUM(cured) as totalCured,
            SUM(active) as totalActive,
            SUM(deaths) as totalDeaths

        FROM 

        district

        WHERE state_id = '${stateId}';
    `;
    const statsArray = await db.get(stateDistrictQuery);
    response.send(statsArray);
  }
);

module.exports = app;
