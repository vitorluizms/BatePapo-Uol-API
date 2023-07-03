import express from "express";
import cors from "cors";
import dayjs from "dayjs";
import { MongoClient } from "mongodb";
import dotenv from "dotenv";
import Joi from "joi";

//Criação do app
const app = express();

//Configurações
app.use(cors());
app.use(express.json());
dotenv.config();

const mongoClient = new MongoClient(process.env.DATABASE_URL);

try {
  await mongoClient.connect();
  console.log("MongoDB connected!");
} catch (err) {
  console.log(err.message);
}

const db = mongoClient.db();
let participants = [];
let messages = [];

//Funções (endpoints)

app.post("/participants", async (req, res) => {
  const { name } = req.body;
  const schemaParticipant = Joi.object({
    name: Joi.string().required(),
  });

  const validate = schemaParticipant.validate(req.body, { abortEarly: false });

  if (validate.error) {
    const errors = validate.error.details.map((detail) => detail.message);
    return res.status(422).send(errors);
  }

  try {
    const user = await db.collection("participants").findOne({ name: name });

    if (user) return res.sendStatus(409);

    await db.collection("participants").insertOne({
      name,
      lastStatus: Date.now(),
    });

    const currentHour = dayjs().locale("pt-br").format("HH:mm:ss");

    await db.collection("messages").insertOne({
      from: name,
      to: "Todos",
      text: "entra na sala...",
      type: "status",
      time: currentHour,
    });

    res.sendStatus(201);
  } catch (err) {
    res.status(500).send(err.message);
  }
});

app.get("/participants", async (req, res) => {
  try {
    const usersList = await db.collection("participants").find().toArray();
    res.status(200).send(usersList);
  } catch (err) {
    res.sendStatus(500);
  }
});

app.post("/messages", async (req, res) => {
  const { to, text, type } = req.body;
  const { user } = req.headers;

  const schemaMessage = Joi.object({
    user: Joi.required(),
    to: Joi.required().string(),
    text: Joi.required().string(),
    type: Joi.required().string().valid("message", "private_message"),
  });

  const body = {
    to,
    text,
    type,
    user,
  };
  const validate = schemaMessage.validate(body, { abortEarly: false });

  if (validate) {
    const errors = validate.error.details.map((detail) => detail.message);
    return res.status(422).send(errors);
  }

  try {
    const userValid = await db
      .collection("participants")
      .findOne({ name: user });

    if (!userValid) {
      return res.sendStatus(422);
    }

    const currentHour = dayjs().locale("pt-br").format("HH:mm:ss");

    await db.collection("messages").insertOne({
      from: user,
      to,
      text,
      type,
      time: currentHour,
    });

    res.sendStatus(201);
  } catch (err) {
    res.sendStatus(500);
  }
});

// app.get("/messages", (req, res) => {
//   const { user } = req.headers;
//   const { limit } = req.query;

//   res.send(messages);
// });

// app.post("/status", (req, res) => {
//   const { user } = req.headers;
// });

const PORT = 5000;
app.listen(PORT, () => {
  console.log(`O servidor está rodando na porta ${PORT}`);
});
