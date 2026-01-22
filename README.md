# flight-ai

To run
`npm install` from root

Then
```
cd packages/web
npm run dev
```

To Deploy AWS Resources:

`npx sst deploy` from root

This flight tracking website uses your home address and past and
present traffic data to alert you on when to depart for your flight. User will be
able to set preferences, like how early to arrive, and then will receive email and
SMS alerts about drive times. These alerts will be sent the night before, and then a
few hours before flight departure.