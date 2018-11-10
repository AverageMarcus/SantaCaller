require('dotenv').config();
const { readFileSync, unlinkSync } = require('fs');
const express = require('express');
const app = express();
const bodyParser = require('body-parser');
const port = process.env.PORT || 9000;

const baseURL = process.env.BASE_URL;

const Nexmo = require('nexmo');
const nexmo = new Nexmo({
  apiKey: process.env.NEXMO_API_KEY,
  apiSecret: process.env.NEXMO_API_SECRET,
  applicationId: process.env.NEXMO_APP_ID,
  privateKey: process.env.NEXMO_PRIVATE_KEY_PATH
});

const calls = {};

app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());


app.get('/recordings/:recording', (req, res) => {
  const { recording } = req.params;
  const path = `${__dirname}/public/recordings/${recording}.mp3`;
  try {
    res.sendFile(path, { headers: {
      'Content-Disposition': 'attachment; filename="SantaRecording.mp3"'
    }});
    setTimeout(() => {
      unlinkSync(path);
    }, 60 * 1000);
  } catch (err) {
    return res.send('Recording not found');
  }
});

app.use(express.static('public'));

app.use('/event', (req, res) => {
  if (calls[req.body.to]) {
    calls[req.body.to].uuid = req.body.conversation_uuid;
  }
  return res.json();
});

app.use('/recordings', (req, res) => {
  console.log(req.body, calls);
  nexmo.files.save(req.body.recording_url, `./public/recordings/${req.body.conversation_uuid}.mp3`, () => {
    for (const number in calls) {
      if (calls[number].uuid === req.body.conversation_uuid) {
        console.log('Found number to send SMS to');
        const url = `${baseURL}/recordings/${req.body.conversation_uuid}`;
        nexmo.message.sendSms(
          'Santa Claus',
          number,
          `You can find a recording of Santas conversation at ${url}`,
          {},
          () => {
            delete calls[number];
            console.log('SMS sent');
          }
        );
      }
    }
  });
  return res.json();
});

app.get('/answer', (req, res) => {
  console.log('Call answered');
  const name = calls[req.query.to].name;
  const caller = calls[req.query.to].caller;

  const ncco = [
    {
      "action": "record",
      "eventUrl": [`${baseURL}/recordings`]
    }
  ];

  switch (caller) {
    case 'Santa':
    default:
      ncco.push(...[
        {
          "action": "talk",
          "voiceName": "Brian",
          "text": `<speak>
          <prosody rate='slow'><prosody pitch='x-low'>Ho Ho Ho!</prosody></prosody> <prosody volume='loud' pitch='x-low'>Merry Christmas ${name}!</prosody>
          <break time='1s' />
          Are you excited for Christmas? <break time='1s' />
          Me and Mrs Clause are very excited! The elves and I have been very busy making lots and lots of toys.
          Have you been good this year? <break time='2s' />
          Oh really? I'll make sure I record that on my list.
          <prosody volume='soft'>So, ${name}, what do you want for Christmas this year?</prosody>
          </speak>`
        },
        {
          "action": "input",
          "timeOut": 2
        },
        {
          "action": "talk",
          "voiceName": "Brian",
          "text": `<speak>
          Yeah? Well, I will speak with my elves and see what we can do.<break time='1s' />
          Oh! Mrs Clause is calling me, so I better be off. Have a Merry Christmas ${name} and don't forget to leave out a carrot for my reindeers, they get very tired and need all the energy they can get.
          Have a wonderful christmas. Bye!
          <break time='3s' />
          </speak>`
        }
      ]);
    case 'Elf':
      ncco.push(...[
        {
          "action": "talk",
          "voiceName": "Emma",
          "text": `<speak>
          <prosody pitch='high'>
            Hi ${name}! I'm one of Santas Elves! Calling all the way from Lapland!
            I hope you're excited for Christmas. Everyone here sure is. We've been so busy making lots and lots of toys.
            Have you been good this year? It's my job to update Santas naughty list.
            <break time='2s' />
            I'll make sure you put you down on the good list.
            One last thing before I go. What do you want for Christmas this year?
          </prosody>
          </speak>`
        },
        {
          "action": "input",
          "timeOut": 2
        },
        {
          "action": "talk",
          "voiceName": "Emma",
          "text": `<speak>
          <prosody pitch='high'>
            Oh wow! That sounds great I'll make sure Santa knows.
            I've got to go now. Lots more toys to make, this is our busy season you know.
            Bye ${name}!
          </prosody>
          </speak>`
        },
      ]);
      case 'Mrs Claus':
        ncco.push(...[
          {
            "action": "talk",
            "voiceName": "Kimberly",
            "text": `<speak>
            <prosody volume='soft'>
              Oh hello ${name}. This is Mrs Claus. Santa is pretty busy right now making lots of toys with his wonderful Elves.
              So I thought I'm help him out by finding out who's been naughty and who's been nice.
              Have you been good this year ${name}?
              <break time='2s' />
              Ok dearie! I'll make sure to update your name on the list.
              Are you all ready for Christmas?
              <break time='2s' />
              I'm not! We still have so much we need to prepare, but I do love the holidays. When my husband has finished delivering all the presents we sit down as a family and have a lovely Christmas dinner.
              Oh my! That reminds me! What is it you want for Christmas ${name}?
            </prosody>
            </speak>`
          },
          {
            "action": "input",
            "timeOut": 2
          },
          {
            "action": "talk",
            "voiceName": "Kimberly",
            "text": `<speak>
            <prosody volume='soft'>
              That sounds lovely! I'll make sure Mr Claus knows.
              I best go now. Lots more children around the world I need to call.
              I hope you have a wonderful Christmas.
              Goodbye dearie.
            </prosody>
            </speak>`
          },
        ]);
  }

  return res.json(ncco);
});

app.use('/submit', (req, res) => {
  console.log(`Santa is calling ${req.query.number}`);

  calls[`+${req.query.number}`] = {
    name: req.query.name,
    caller: req.query.caller
  };

  nexmo.calls.create({
    to: [{
      type: 'phone',
      number: `+${req.query.number}`
    }],
    from: {
      type: 'phone',
      number: process.env.NEXMO_PHONE_NUMBER
    },
    answer_url: [`${baseURL}/answer`]
  }, (err) => {
    console.log('Call sent out', JSON.stringify(err));
  });

  return res.redirect('/submitted.html');
});

app.listen(port, () => console.log(`Example app listening on port ${port}!`));
