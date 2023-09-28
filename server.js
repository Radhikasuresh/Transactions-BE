const express = require("express");
const app = express();
const db = require("./db");
const mongoose = require("mongoose");
const axios = require("axios");
const Transaction = require("./models/Transactions");
const cors = require("cors");

app.use(express.json());
app.use(cors());

app.get("/", (req, res) => {
  res.send("server working🔥");
});
app.post("/fetch-and-save-data", async (req, res) => {
  try {
    const response = await axios.get(
      "https://s3.amazonaws.com/roxiler.com/product_transaction.json"
    );
    const data = response.data;

    await Transaction.insertMany(data);

    res.json({ message: "Data fetched and saved successfully" });
  } catch (error) {
    console.error("Error fetching and saving data:", error);
    res.status(500).json({ error: "Error fetching and saving data" });
  }
});
app.get("/list-transactions", async (req, res) => {
  try {
    const { month, search, page = 1, per_page = 10 } = req.query;

    let matchQuery = {};

    if (month) {
      // Validate the month parameter format (YYYY-MM)
      const monthRegex = /^\d{4}-\d{2}$/;
      if (!month.match(monthRegex)) {
        throw new Error("Invalid month format. Use YYYY-MM.");
      }

      // Construct date range query for the specified month
      const startDate = new Date(`${month}-01`);
      const endDate = new Date(startDate);
      endDate.setMonth(endDate.getMonth() + 1, 0); // Last day of the specified month
      endDate.setHours(23, 59, 59, 999);

      const dateOfSaleQuery = {
        dateOfSale: {
          $gte: startDate,
          $lte: endDate,
        },
      };

      matchQuery = { ...dateOfSaleQuery };
    }

    if (search) {
      const searchQuery = {
        $or: [
          { productTitle: { $regex: search, $options: "i" } },
          { productDescription: { $regex: search, $options: "i" } },
        ],
      };

      matchQuery = { ...matchQuery, ...searchQuery };
    }

    // Query MongoDB for total items and transactions
    const totalItems = await Transaction.countDocuments(matchQuery);
    const transactions = await Transaction.find(matchQuery)
      .limit(Number(per_page))
      .skip((Number(page) - 1) * Number(per_page));

    res.json({ transactions, total_items: totalItems });
  } catch (error) {
    console.error("Error listing transactions:", error.message);
    res.status(400).json({ error: error.message });
  }
});

//Statistics API

app.get("/statistics", async (req, res) => {
  try {
    const { month } = req.query;

    let matchQuery = {}; // Default match query for all data

    if (month) {
      // Validate the month parameter format (YYYY-MM)
      const monthRegex = /^\d{4}-\d{2}$/;
      if (!month.match(monthRegex)) {
        throw new Error("Invalid month format. Use YYYY-MM.");
      }

      // Construct date range query for the specified month
      const startDate = new Date(`${month}-01`);
      const endDate = new Date(startDate);
      endDate.setMonth(endDate.getMonth() + 1, 0); // Last day of the specified month
      endDate.setHours(23, 59, 59, 999);

      const dateOfSaleQuery = {
        dateOfSale: {
          $gte: startDate,
          $lte: endDate,
        },
      };

      matchQuery = { ...dateOfSaleQuery };
    }

    const totalSaleAmount = await Transaction.aggregate([
      {
        $match: matchQuery, // Use the match query here
      },
      {
        $group: {
          _id: null,
          totalSaleAmount: { $sum: "$price" },
          totalSoldItems: { $sum: 1 },
          totalNotSoldItems: {
            $sum: {
              $cond: { if: { $eq: ["$sold", false] }, then: 1, else: 0 },
            },
          },
        },
      },
    ]);

    const result = totalSaleAmount[0] || {
      totalSaleAmount: 0,
      totalSoldItems: 0,
      totalNotSoldItems: 0,
    };

    res.json(result);
  } catch (error) {
    console.error("Error calculating statistics:", error.message);
    res.status(400).json({ error: error.message });
  }
});

// Bar Chart API
app.get("/bar-chart", async (req, res) => {
  const { month } = req.query;

  try {
    const priceRanges = [
      { range: "0-100", min: 0, max: 100 },
      { range: "101-200", min: 101, max: 200 },
      { range: "201-300", min: 201, max: 300 },
      { range: "301-400", min: 301, max: 400 },
      { range: "401-500", min: 401, max: 500 },
      { range: "501-600", min: 501, max: 600 },
      { range: "601-700", min: 601, max: 700 },
      { range: "701-800", min: 701, max: 800 },
      { range: "801-900", min: 801, max: 900 },
      { range: "901-above", min: 901, max: Infinity },
    ];

    const priceRangeCounts = {};

    if (month) {
      const year = new Date().getFullYear(); // Get the current year
      const startDate = new Date(`${year}-${month}-01T00:00:00.000+00:00`); // Start of the specified month
      const endDate = new Date(startDate);
      endDate.setMonth(endDate.getMonth() + 1, 0); // End of the specified month

      for (const range of priceRanges) {
        const count = await Transaction.countDocuments({
          dateOfSale: {
            $gte: startDate,
            $lte: endDate,
          },
          price: { $gte: range.min, $lte: range.max },
        });

        priceRangeCounts[range.range] = count;
      }
    } else {
      for (const range of priceRanges) {
        const count = await Transaction.countDocuments({
          price: { $gte: range.min, $lte: range.max },
        });

        priceRangeCounts[range.range] = count;
      }
    }

    res.json(priceRangeCounts);
  } catch (error) {
    console.error("Error generating bar chart data:", error);
    res.status(500).json({ error: "Error generating bar chart data" });
  }
});

// Pie Chart API
app.get("/pie-chart", async (req, res) => {
  const { month } = req.query;

  try {
    const categoryCounts = {};

    if (month) {
      const categories = await Transaction.distinct("category", {
        dateOfSale: { $regex: month, $options: "i" },
      });

      for (const category of categories) {
        const count = await Transaction.countDocuments({
          dateOfSale: { $regex: month, $options: "i" },
          category,
        });

        categoryCounts[category] = count;
      }
    } else {
      const categories = await Transaction.distinct("category");

      for (const category of categories) {
        const count = await Transaction.countDocuments({ category });

        categoryCounts[category] = count;
      }
    }

    res.json(categoryCounts);
  } catch (error) {
    console.error("Error generating pie chart data:", error);
    res.status(500).json({ error: "Error generating pie chart data" });
  }
});

const PORT = process.env.PORT || 8000;
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
