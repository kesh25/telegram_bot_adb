// handles mpesa functionality;
const { Buffer } = require("buffer");

const axios = require("axios");
const datetime = require("node-datetime");

class MPESA {
  constructor(phone, amount) {
    let formattedPhone = phone.startsWith("0") ? `254${phone.slice(1)}` : phone;
    this.phone = formattedPhone;
    this.amount = amount;

    this.consumerKey = process.env.MPESA_CONSUMER_KEY;
    this.secret = process.env.MPESA_SECRET;
    this.shortCode = process.env.MPESA_SHORTCODE;
    this.tillNo = process.env.MPESA_TILL;
    this.passKey;

    if (process.env.NODE_ENV === "development") {
      this.passKey =
        "bfb279f9aa9bdbcf158e97dd71a467cd2e0c893059b10f78e6b72ada1ed2c919";
    }

    this.environment = process.env.NODE_ENV;

    this.server_url = process.env.SERVER_URL; 
    //   "https://22b5bc47-90be-45a6-849e-dc3f2121dece-00-312c55gr7wrby.riker.replit.dev/";
  }

  //   get authorization
  async generateToken() {
    const auth = Buffer.from(
      `${this.consumerKey}:${this.secret}`,
      "utf-8"
    ).toString("base64");

    const headers = {
      Authorization: "Basic " + auth,
    };

    let url = this.generateURL().token;

    let token = await this.makeAxiosRequest("get", null, headers, url);

    if (token.status === "success") this.token = token.data.access_token;
    else {
      throw new Error(
        token.data?.response?.statusText || "Error generating token!"
      );
    }
  }

  //   initiate STK push
  async STKPush() {
    // get the phone number  and amount from the data
    try {
      await this.generateToken();

      let PartyA = this.phone;
      let PhoneNumber = this.phone;
      let AccountReference = "ABS Tutorials";
      let Amount = this.amount;

      let payment = {
        BusinessShortCode: this.shortCode,
        PartyB: this.tillNo,
        Password: this.generatePassword(true).base64EncodedPassword,
        Timestamp: this.generatePassword().formatted,
        TransactionType:
          this.environment === "production"
            ? "CustomerBuyGoodsOnline"
            : "CustomerPayBillOnline",
        CallBackURL: `${this.server_url}/mpesa/result`,
        TransactionDesc: "ADB subscription fees!",
        Amount,
        PartyA,
        PhoneNumber,
        AccountReference,
      };

	  

      let url = this.generateURL().stk;
      let res = await this.makeAxiosRequest("post", payment, null, url);

      return res;
    } catch (err) {
      return {
        status: "error",
        err,
      };
    }
  }

  // utils
  // generate saf url endpoint
  generateURL() {
    let base = "https://api.safaricom.co.ke";
    if (this.environment === "development")
      base = "https://sandbox.safaricom.co.ke";

    // https://sandbox.safaricom.co.ke/oauth/v1/generate?grant_type=client_credentials

    // actual urls
    let token = `${base}/oauth/v1/generate?grant_type=client_credentials`;
    let stk = `${base}/mpesa/stkpush/v1/processrequest`;
    let status = `${base}/mpesa/transactionstatus/v1/query`;

    return {
      token,
      stk,
      status,
    };
  }

  // axios to make request to daraja api
  async makeAxiosRequest(method, data, headersObject, url) {
    let headers = headersObject || {
      Authorization: "Bearer " + this.token,
    };
    try {
      let res =
        method === "get"
          ? await axios[method](url, { headers })
          : await axios[method](url, data, { headers });
      return {
        status: "success",
        code: 200,
        data: res.data || res,
      };
    } catch (err) {
      return {
        status: "fail",
        code: err.response?.status || 400,
        data: err.response?.data || err,
      };
    }
  }

  // generatePassword
  generatePassword() {
    const dt = datetime.create();
    const formatted = dt.format("YmdHMS");
    // Base64 Encode (Business Short Code + PassKey + Timestamp)
    const passString = `${this.shortCode}${this.passKey}${formatted}`;
    return {
      base64EncodedPassword: Buffer.from(passString).toString("base64"),
      dt,
      formatted,
    };
  }

  // parsing results
  parseSTKResults(data) {
    let {
      MerchantRequestID,
      CheckoutRequestID,
      ResultCode,
      ResultDesc,
      CallbackMetadata,
    } = data;

    let result = {};
    let metadata = {};
    let TransactionID;

    if (ResultCode === 0) {
      let metadataItems = CallbackMetadata.Item;
      for (let i = 0; i < metadataItems.length; i++) {
        let curr = metadataItems[i];
        metadata[curr.Name] = curr.Value;
      }
      TransactionID = metadata.MpesaReceiptNumber;
    }

    result = {
      MerchantRequestID,
      CheckoutRequestID,
      ResultCode,
      ResultDesc,
      metadata,
      TransactionID,
      status:
        ResultCode === 0
          ? "success"
          : ResultCode === "1032"
          ? "cancelled"
          : "failed",
    };

    return result;
  }
}

module.exports = MPESA;
