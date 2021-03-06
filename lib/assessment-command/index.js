const fs = require("fs");
const path = require("path");
const selectCheckpoint = require("../select-checkpoint");
const selectModule = require("../select-module");
const saveChallenge = require("./saveChallenge");
const saveAssessment = require("./saveAssessment");
const challengeOptions = require("../challenge-options");
const readQualifiedFolder = require("./readQualifiedFolder");
const saveChallengeItem = require("./saveChallengeItem");

const command = "assessment";
const describe =
  "Prompts for zid module then checkpoint to automatically create or update the qualified assessment.";

function builder(yargs) {
  return yargs.config().option("q", {
    alias: "qualifiedApiKey",
    demandOption: true,
    describe:
      "Qualified API access key copied from https://www.qualified.io/hire/account/integrations#api-key.",
    nargs: 1,
    type: "string",
  });
}

async function handler(config) {
  const headers = {
    Authorization: config.qualifiedApiKey,
    "Content-Type": "application/json",
    Accept: "application/json",
  };

  const module = await selectModule(config.webDevPath);

  const checkpoint = await selectCheckpoint(config.webDevPath, module);

  const checkpointFolder = path.join(config.webDevPath, "library", checkpoint);

  const qualifiedFolder = path.join(checkpointFolder, "qualified");

  if (!fs.existsSync(qualifiedFolder)) {
    throw new Error(`Qualified folder not found: ${qualifiedFolder}`);
  }

  const challengeFile = path.join(checkpointFolder, "challenge.json");

  const existingChallenge = fs.existsSync(challengeFile)
    ? require(challengeFile)
    : { data: {} };

  const options = await challengeOptions(existingChallenge.data);

  const filePathToId = (existingChallenge.data.files || []).reduce(
    (accumulator, file) => {
      accumulator[file.path] = file.id;
      return accumulator;
    },
    {}
  );

  const referenceFilePathToId = (
    existingChallenge.data.referenceFiles || []
  ).reduce((accumulator, file) => {
    accumulator[file.path] = file.id;
    return accumulator;
  }, {});

  const folderInfo = readQualifiedFolder(
    qualifiedFolder,
    filePathToId,
    referenceFilePathToId
  );

  try {
    const savedChallenge = await saveChallenge(
      existingChallenge.data.id,
      qualifiedFolder,
      checkpoint,
      module.name,
      module.code,
      options,
      config.debug,
      headers,
      folderInfo
    );

    fs.writeFileSync(challengeFile, JSON.stringify(savedChallenge, null, 4));

    const savedAssessment = await saveAssessment(
      checkpoint,
      checkpointFolder,
      savedChallenge,
      config.debug,
      headers
    );

    await saveChallengeItem(
      checkpointFolder,
      savedAssessment.data.id,
      savedChallenge.data.id,
      checkpoint,
      config.debug,
      headers,
      config.qualifiedApiKey
    );

    console.log("Done");
    console.log("Commit any new or updated .json files to the repository.");
    console.log(
      "Also visit the assessment link below to publish the assessment."
    );
    console.log(
      `https://www.qualified.io/hire/challenges/${savedChallenge.data.id}`
    );
    console.log(
      `https://www.qualified.io/hire/assessments/${savedAssessment.data.id}`
    );
  } catch (error) {
    console.error(error);
  }
}

module.exports = {
  command,
  describe,
  builder,
  handler,
};
