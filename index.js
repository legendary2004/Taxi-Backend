import express from "express";
import cors from 'cors';
import mysql from 'mysql2';
import dotenv from "dotenv";
import bodyParser from "body-parser";
import path from "path";
import { fileURLToPath } from 'url';
import ElasticEmail from "@elasticemail/elasticemail-client";
import nodemailer from "nodemailer"
import { profileUpload } from "./profileUpload.js"

dotenv.config({path: './.env'})

const app = express();
const port = 5000;

app.use(express.urlencoded({ extended: false }));
app.use(express.json());
app.use(cors());
app.use(bodyParser.json());

const db = mysql.createConnection({
    host: process.env.db_host, 
    user: process.env.db_user,
    password: process.env.db_pass,
    database: process.env.db_name,
    port: process.env.db_port
})

let pool;

const createPool = () => {
  pool = mysql.createPool({
    host: process.env.db_host,
    user: process.env.db_user,
    password: process.env.db_pass,
    database: process.env.db_name,
    port: process.env.db_port,
    waitForConnections: true,
    connectionLimit: 250,
    queueLimit: 0,
  });

  pool.on('error', (err) => {
    console.error('Database connection error', err);
    if (err.code === 'PROTOCOL_CONNECTION_LOST') {
      createPool(); // Recreate the pool if connection is lost
    }
  });
};

createPool();

db.connect(error => {
    if (error) {
        console.log(error);
    }
    else {
        console.log("Connected");
    }
})

function sendEmail(from, to, subject, text) {
    let transporter = nodemailer.createTransport({
        service: process.env.host,
        port: process.env.port,
        secureConnection: process.env.secure, 
        auth: {
            user: process.env.conEmail,
            pass: process.env.pass
        }
    });

    let mailOptions = {
        from,
        to,
        subject,
        text
    };

    transporter.sendMail(mailOptions, function(error, info){
        if (error) {
            console.log(error);
        } else {
            console.log('Email sent: ' + info.response);
        }
    });
}

function generateNumber(res, from, to) {
  const randomNum = Math.floor(1000 + Math.random()  * 9000)
  sendEmail(from, to, "Code verification", `Your code is: ${randomNum}`)
  res.send({
      number: "" + randomNum
  })
}

const getAllBookings = (res) => {
    db.query("SELECT * FROM bookings", (err, result) => {
        if (err) console.log(err)
        else {
            res.send({
                bookings: result
            })
        }
    })
}

app.post("/register", (req, res) => {
    const {email, pass, passRepeat} = req.body

    db.query("SELECT * FROM users WHERE email = ?", [email], (err, result) => {
        if (err) {
            res.send({
                message: err
            })
        }
        else if (result.length > 0) {
            res.send({
                message: "This email is already in use"
            })
        }
        else if (pass != passRepeat) {
            res.send({
                message: "Passwords do not match"
            })
        }
        else {
            generateNumber(res, process.env.email, req.body.email)
        }
    })
})

app.post("/resendCode", (req, res) => {
  generateNumber(res, process.env.email, req.body.email)
})

app.post("/confirmCode", (req, res) => {

  profileUpload(req, res, (errr) => {
      if (errr) console.log(errr)   
      else {
          const {firstName, lastName, email, phone, password} = req.body
          const img = req.file ? req.file.filename : "avatar.png"
      
          db.query("INSERT INTO users SET ?", {firstName, lastName, email, password, phone, profile_img: img}, (error, results) => {
            if (error) {
                res.send({
                    message: error
                })
            }
            else {
                res.send({
                    message: "Account succesfully registered"
                })
            }
        })
      }
  })
})

app.post("/login", (req, res) => {
  const {email, pass} = req.body

  db.query("SELECT * FROM users WHERE email = ? and password = ?", [email, pass], (err, result) => {
      if (err) {
          res.send({
              message: err
          })
      }
      else if (result.length == 0) {
          res.send({
              message: "Incorrect email or password"
          })
      }
      else {
          res.send({
            message: "",
            user: result[0]
          })
      }
  })
})

app.post("/confirmBooking", (req, res) => {
    const {firstName, lastName, country, email, phone, date, time, message, origin, destination} = req.body

    db.query("INSERT INTO bookings SET ?", {firstName, lastName, country, email, phone, date, time, message, origin, destination}, (error, results) => {
        if (error) {
            res.send({
                message: error
            })
        }
        else {
            sendEmail(process.env.email, process.env.email, "Booking", `A booking has just been placed by the following user:
                FirstName - ${firstName},
                LastName - ${lastName},
                Country - ${country},
                Email - ${email},
                Phone - ${phone},
                Date - ${date - time},
                Message - ${message},
                Pickup location - ${origin},
                Dropoff location - ${destination}
            `)
            sendEmail(process.env.email, email, "AlbVoyage Booking", `Hello traveler. Thank you for trusting our services. We will contact you very soon for further information.`)
            res.send({
                message: "Booking recieved. Thank you."
            })
        }
    })
})

app.post("/getAllBookings", (req, res) => {
    getAllBookings(res)
})

app.post("/deleteBooking", (req, res) => {
    db.query("DELETE FROM bookings WHERE id = ?", [req.body.id], (err, result) => {
        if (err) console.log(err)
        else {
            getAllBookings(res)
        }   
    })
})

app.post("/contact", (req, res) => {
    const {email, subject, message} = req.body

    sendEmail(process.env.email, email, "Message recieved", "Hello user. Thank you for reaching us out. One of our team members will reach out to you soon.")
    sendEmail(email, process.env.email, subject, message)
    res.send({
        message: "Thank you!"
    })
})

app.get('/message', (req, res) => {
    res.json({ message: "Hello from server!" });
});

app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});
