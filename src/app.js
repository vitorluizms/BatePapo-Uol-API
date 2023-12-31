import express from "express";
import cors from "cors";
import dayjs from "dayjs";
import { MongoClient, ObjectId } from "mongodb";
import dotenv from "dotenv";
import Joi from "joi";
import { stripHtml } from "string-strip-html";

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


//Funções (endpoints)
//Requisições POST
app.post("/participants", async (req, res) => {
  let { name } = req.body;
  const schemaParticipant = Joi.object({
    name: Joi.string().required(),
  });

  const validate = schemaParticipant.validate(req.body, { abortEarly: false });

  if (validate.error) {
    const errors = validate.error.details.map((detail) => detail.message);
    return res.status(422).send(errors);
  }

  name = stripHtml(name).result.trim();

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
      from: stripHtml(user).result.trim(),
      to: stripHtml(to).result.trim(),
      text: stripHtml(text).result.trim(),
      type: stripHtml(type).result.trim(),
      time: dayjs().locale("pt-br").format("HH:mm:ss"),
    });

    res.sendStatus(201);
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

    await db
      .collection("participants")
      .updateOne({ name: user }, { $set: { lastStatus: Date.now() } });
    res.sendStatus(200);
  } catch (err) {
    res.status(500).send(err.message);
  }
});


//Requisições GET
app.get("/participants", async (req, res) => {
  try {
    const usersList = await db.collection("participants").find().toArray();
    res.status(200).send(usersList);
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


//Requisição DELETE
app.delete("/messages/:id", async (req, res) => {
  const { user } = req.headers;
  const { id } = req.params;

  try {
    const message = await db
      .collection("messages")
      .findOne({ _id: new ObjectId(id) });
    if (!message) return res.sendStatus(404);
    if (message.from !== user) return res.sendStatus(401);

    await db.collection("messages").deleteOne({ _id: new ObjectId(id) });
    res.sendStatus(200);
  } catch (err) {
    res.status(500).send(err.message);
  }
});


//Requisição PUT
app.put("/messages/:id", async (req, res) => {
  const { to, type, text } = req.body;
  const { user } = req.headers;
  const { id } = req.params;

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
    const message = await db
      .collection("messages")
      .findOne({ _id: new ObjectId(id) });

    if (!message) return res.sendStatus(404);
    if (message.from !== user)
      return res.status(401).send("Você não é o dono da mensagem");

    await db
      .collection("messages")
      .updateOne({ _id: new ObjectId(id) }, { $set: { to, text, type } });
    res.sendStatus(200);
  } catch (err) {
    res.status(500).send(err.message);
  }
});


//Função de remoção automática de usuário a cada 15 segundos
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
    res.sendStatus(500).send(err.message);
  }
}, 15000);

const PORT = 5000;
app.listen(PORT, () => {
  console.log(`O servidor está rodando na porta ${PORT}`);
});
