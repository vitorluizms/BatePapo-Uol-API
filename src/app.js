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

    await db.collection("messages").insertOne({
      from: name,
      to: "Todos",
      text: "entra na sala...",
      type: "status",
      time: dayjs().locale("pt-br").format("HH:mm:ss"),
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
    res.status(500).send(err.message);
  }
});

app.post("/messages", async (req, res) => {
  const { to, text, type } = req.body;
  const { user } = req.headers;

  const schemaMessage = Joi.object({
    user: Joi.required(),
    to: Joi.string().required(),
    text: Joi.string().required(),
    type: Joi.string().valid("message", "private_message").required(),
  });

  const body = {
    to,
    text,
    type,
    user,
  };
  const validate = schemaMessage.validate(body, { abortEarly: false });

  if (validate.error) {
    const errors = validate.error.details.map((detail) => detail.message);
    return res.status(422).send(errors);
  }

  try {
    const userValid = await db
      .collection("participants")
      .findOne({ name: user });

    if (!userValid)
      return res.status(422).send("Usuário deslogado, faça login!");

    await db.collection("messages").insertOne({
      from: user,
      to,
      text,
      type,
      time: dayjs().locale("pt-br").format("HH:mm:ss"),
    });

    res.sendStatus(201);
  } catch (err) {
    res.status(500).send(err.message);
  }
});

app.get("/messages", async (req, res) => {
  const { user } = req.headers;
  const { limit } = req.query;
  const schemaUser = Joi.object({
    user: Joi.string().required(),
    limit: Joi.number().min(1).optional(),
  });
  const body = {
    user,
    limit,
  };
  const validate = schemaUser.validate(body, { abortEarly: false });

  if (validate.error) {
    const errors = validate.error.details.map((detail) => detail.message);
    return res.status(422).send(errors);
  }

  try {
    if (limit === undefined) {
      const messages = await db
        .collection("messages")
        .find({ $or: [{ to: "Todos" }, { to: user }, { from: user }] })
        .toArray();
      return res.status(200).send(messages);
    }
    const messages = await db
      .collection("messages")
      .find({ $or: [{ to: "Todos" }, { to: user }, { from: user }] })
      .limit(Number(limit))
      .toArray();
    res.status(200).send(messages);
  } catch (err) {
    res.status(500).send(err.message);
  }
});

app.post("/status", async (req, res) => {
  const { user } = req.headers;
  const schemaStatus = Joi.object({
    user: Joi.string().required(),
  });
  const object = { user };

  const validate = schemaStatus.validate(object, { abortEarly: false });
  if (validate.error) {
    const errors = validate.error.details.map((detail) => detail.message);
    return res.status(404).send(errors);
  }
  try {
    const userValid = await db
      .collection("participants")
      .findOne({ name: user });

    if (!userValid) return res.status(404).send("Usuário não encontrado!");

    const updateStatus = await db
      .collection("participants")
      .updateOne({ name: user }, { $set: { lastStatus: Date.now() } });
    res.sendStatus(200);
  } catch (err) {
    res.status(500).send(err.message);
  }
});

setInterval(async () => {
  try {
    const participants = await db
      .collection("participants")
      .find({ lastStatus: { $lt: Date.now() - 10000 } })
      .toArray();

    participants.forEach(async (user) => {
      await db.collection("participants").deleteOne({ name: user.name });

      await db.collection("messages").insertOne({
        from: user.name,
        to: "Todos",
        text: "sai da sala...",
        type: "status",
        time: dayjs().locale("pt-br").format("HH:mm:ss"),
      });
    });
  } catch (err) {
    res.sendStatus(500)
  }
}, 15000);

const PORT = 5000;
app.listen(PORT, () => {
  console.log(`O servidor está rodando na porta ${PORT}`);
});
