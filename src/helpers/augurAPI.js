const axios = require("axios");

const augurAPI = async (id, level, url) => {
  if (!process.env.AUGUR_API_KEY) {
    console.error("AUGUR_API_KEY not provided");
    return;
  }

  try {
    const apiUrl = "https://projectbadge.chaoss.io/api/unstable/dei/repo/add";
    const apiKey = process.env.AUGUR_API_KEY;
    const response = await axios.post(
      `${apiUrl}?id=${id}&level=${level}&url=${encodeURIComponent(url)}`,
      {},
      {
        headers: {
          Authorization: `Client ${apiKey}`,
        },
      }
    );

    return response.data;
  } catch (error) {
    console.error("Error:", error.message);
  }
};

augurAPI();

module.exports = augurAPI;
