const axios = require("axios");

const TOXICITY_API = "http://127.0.0.1:8001/validate-comment";

// threshold can be tuned later
const TOXICITY_THRESHOLD = 0.7;

async function validateCommentToxicity(text) {
  try {
    const response = await axios.post(TOXICITY_API, {
      text
    });

    const { allowed, scores } = response.data;

    return {
      allowed,
      scores
    };
  } catch (error) {
    console.error("❌ Toxicity service error:", error.message);

    // Fail-safe: allow comment if service is down
    return {
      allowed: true,
      scores: null
    };
  }
}

module.exports = {
  validateCommentToxicity
};
