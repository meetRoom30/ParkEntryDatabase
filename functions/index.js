// functions/index.js
const functions = require('firebase-functions');
const admin = require('firebase-admin');
const { v4: uuidv4 } = require('uuid');
const cors = require('cors')({ origin: true });

admin.initializeApp();

const db = admin.database();

exports.registerParkingLot = functions.https.onRequest((req, res) => {
  cors(req, res, async () => {
    const { name, timeZone } = req.body;

    if (!name || !timeZone) {
      return res.status(400).send('Name and timeZone are required.');
    }

    try {
      const parkingLotId = uuidv4();

      await db.ref(`parking-lots/${parkingLotId}`).set({
        name,
        timeZone,
      });

      res.status(200).json({
        success: true,
        parkingLotId,
      });
    } catch (error) {
      console.error('Error registering parking lot:', error);
      res.status(500).send(error.message);
    }
  });
});

exports.addCar = functions.https.onRequest((req, res) => {
  cors(req, res, async () => {
    const { parkingLotId, numberPlate, imageBase64, timeOfEntry } = req.body;

    if (!parkingLotId || !numberPlate || !imageBase64 || !timeOfEntry) {
      return res.status(400).json({ success: false, error: 'All parameters are required.' });
    }

    try {
      const uniqueCode = uuidv4();

      const parkingLotSnapshot = await db.ref(`parking-lots/${parkingLotId}`).once('value');

      if (!parkingLotSnapshot.exists()) {
        return res.status(404).send('Parking lot not found.');
      }

      const { timeZone } = parkingLotSnapshot.val();

      const timeOfEntry = new Date().toISOString();

      const imageBuffer = Buffer.from(imageBase64, 'base64');
      const imagePath = `cars/${uniqueCode}.jpg`;

      const storage = admin.storage().bucket();

      const file = storage.file(imagePath);
      await file.save(imageBuffer, {
        metadata: { contentType: 'image/jpeg' },
      });

      const [imageUrl] = await file.getSignedUrl({
        action: 'read',
        expires: '03-01-2100', 
      });

      const carData = {
        carNumberPlate: numberPlate,
        timeOfEntry,
        imageUrl,
        uniqueCode,
      };

      await db.ref(`parking-lots/${parkingLotId}/current-cars/${uniqueCode}`).set(carData);

      res.status(200).json({
        success: true,
        uniqueCode,
      });
    } catch (error) {
        console.error('Error adding car:', error);
        res.status(500).json({ success: false, error: error.message });    }
  });
});

exports.removeCar = functions.https.onRequest((req, res) => {
  cors(req, res, async () => {
    const { parkingLotId, identifier } = req.body;

    if (!parkingLotId || !identifier) {
      return res.status(400).send('All parameters are required.');
    }

    try {
      const parkingLotRef = db.ref(`parking-lots/${parkingLotId}`);
      const parkingLotSnapshot = await parkingLotRef.once('value');

      if (!parkingLotSnapshot.exists()) {
        return res.status(404).send('Parking lot not found.');
      }

      const currentCarsRef = parkingLotRef.child('current-cars');
      let carSnapshot = await currentCarsRef.child(identifier).once('value');

      if (!carSnapshot.exists()) {
        const carsSnapshot = await currentCarsRef.orderByChild('carNumberPlate').equalTo(identifier).once('value');

        if (carsSnapshot.exists()) {
          const carKey = Object.keys(carsSnapshot.val())[0];
          carSnapshot = carsSnapshot.child(carKey);
        } else {
          return res.status(404).send('Car not found.');
        }
      }

      const carData = carSnapshot.val();
      const uniqueCode = carData.uniqueCode;

      const timeOfExit = new Date().toISOString();
      carData.timeOfExit = timeOfExit;

      await parkingLotRef.child(`history/${uniqueCode}`).set(carData);

      await currentCarsRef.child(uniqueCode).remove();

      res.status(200).json({
        success: true,
        timeOfEntry: carData.timeOfEntry,
        timeOfExit: carData.timeOfExit,
      });
    } catch (error) {
      console.error('Error removing car:', error);
      res.status(500).send(error.message);
    }
  });
});

exports.getCurrentCars = functions.https.onRequest((req, res) => {
    cors(req, res, async () => {
      const { parkingLotId } = req.query;
  
      if (!parkingLotId) {
        return res.status(400).json({ success: false, error: 'ParkingLotId is required.' });
      }
  
      try {
        const currentCarsRef = db.ref(`parking-lots/${parkingLotId}/current-cars`);
        const snapshot = await currentCarsRef.once('value');
  
        const cars = snapshot.exists() ? Object.values(snapshot.val()) : [];
  
        res.status(200).json({
          success: true,
          cars,
        });
      } catch (error) {
        console.error('Error fetching current cars:', error);
        res.status(500).json({ success: false, error: error.message });
      }
    });
  });