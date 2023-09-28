const mongoose = require("mongoose");

const transactionSchema = new mongoose.Schema({
  id: Number,
  title: String,
  description: String,
  price: Number,
  category: String,
  image: String,
  sold: Boolean,
  dateOfSale: Date,
});
module.exports = mongoose.model("transactions", transactionSchema);
