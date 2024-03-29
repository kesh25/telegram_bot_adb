const express = require("express"); 
const MPESA = require("./lib/mpesa");

const router = express.Router(); 

// test 
router.get("/", async (req, res) => {
    res.send("Hello World!");
}); 

// receive mpesa result; 
router.post("/mpesa/result", async (req, res) => {
    let body = req.body.Body.stkCallback; 

	// initiate mpesa 
	let mpesa = new MPESA(); 
	let result = mpesa.parseSTKResults(body); 

	console.log(result)

	res.status(200).json({status: "success"})
})

module.exports = router; 