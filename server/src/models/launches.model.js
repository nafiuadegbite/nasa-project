const axios = require("axios");

const launchesDatabase = require("./launches.mongo");
const planets = require("./planets.mongo");

const DEFAULT_FLIGHT_NUMBER = 100;

const SPACEX_API_URL = `https://api.spacexdata.com/v4/launches/query`;

const populateLaunches = async () => {
  const response = await axios.post(SPACEX_API_URL, {
    query: {},
    options: {
      pagination: false,
      populate: [
        {
          path: "rocket",
          select: {
            name: 1,
          },
        },
        {
          path: "payloads",
          select: {
            customers: 1,
          },
        },
      ],
    },
  });

  if (response.status !== 200) {
    console.log(`Problem downloading launch`);
    throw new Error(`Launch data download failed`);
  }

  const launchDocs = response.data.docs;
  for (const launchDoc of launchDocs) {
    const payloads = launchDoc.payloads;
    const customers = payloads.flatMap((payload) => {
      return payload.customers;
    });
    const launch = {
      flightNumber: launchDoc.flight_number,
      mission: launchDoc.name,
      rocket: launchDoc.rocket.name,
      launchDate: launchDoc.date_local,
      upcoming: launchDoc.upcoming,
      success: launchDoc.success,
      customers,
    };
    saveLaunch(launch);
  }
};

const loadLaunchData = async () => {
  const firstLaunch = await findLaunch({
    flightNumber: 1,
    rocket: "Falcon 1",
    mission: "FalconSat",
  });

  if (firstLaunch) {
    console.log(`Launch data already loaded!`);
  } else {
    await populateLaunches();
  }
};

const findLaunch = async (filter) => {
  return await launchesDatabase.findOne(filter);
};

const existsLaunchWithId = async (launchId) => {
  return await findLaunch({ flightNumber: launchId });
};

const getAllLaunches = async (skip, limit) => {
  return await launchesDatabase
    .find(
      {},
      {
        _id: 0,
        __v: 0,
      }
    )
    .sort({ flightNumber: 1 })
    .skip(skip)
    .limit(limit);
};

const saveLaunch = async (launch) => {
  await launchesDatabase.findOneAndUpdate(
    {
      flightNumber: launch.flightNumber,
    },
    launch,
    {
      upsert: true,
    }
  );
};

const getLatestFlightNumber = async () => {
  const latestLaunch = await launchesDatabase.findOne().sort("-flightNumber");

  if (!latestLaunch) {
    return DEFAULT_FLIGHT_NUMBER;
  }

  return latestLaunch.flightNumber;
};

const scheduleNewLaunch = async (launch) => {
  const planet = await planets.findOne({
    keplerName: launch.target,
  });

  if (!planet) {
    throw new Error(`No matching planet found`);
  }

  const newFlightNumber = (await getLatestFlightNumber()) + 1;

  const newLaunch = Object.assign(launch, {
    flightNumber: newFlightNumber,
    customers: ["ZTM", "NASA"],
    upcoming: true,
    success: true,
  });

  await saveLaunch(newLaunch);
};

const abortLaunchIdById = async (launchId) => {
  const aborted = await launchesDatabase.updateOne(
    {
      flightNumber: launchId,
    },
    {
      upcoming: false,
      success: false,
    }
  );

  return aborted;
};

module.exports = {
  loadLaunchData,
  getAllLaunches,
  existsLaunchWithId,
  abortLaunchIdById,
  scheduleNewLaunch,
};
