import express from "express";
import cors from "cors";
import dayjs from "dayjs";

const app = express();

app.use(cors());
app.use(express.json());

let participants = [];
let messages = [];

app.post("/participants", (req, res) => {
  const { name } = req.body;
  const bodyUser = {
    name,
    lastStatus: Date.now(),
  };
  const currentHour = dayjs().locale("pt-br").format("HH:mm:ss");
  const bodyMessage = {
    from: name,
    to: "Todos",
    text: "entra na sala...",
    type: "status",
    time: currentHour,
  };
  participants.push(bodyUser);
  messages.push(bodyMessage);
  res.status(201).send(messages);
});

const PORT = 5000;
app.listen(PORT, () => {
  console.log(`O servidor está rodando na porta ${PORT}`);
});
