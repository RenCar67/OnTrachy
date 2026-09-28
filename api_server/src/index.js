import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { connectDB } from './config/database.js';
import { getPackageByTracking, trackAndSavePackage } from './controllers/trackingController.js';
import { errorHandler } from './middlewares/errorHandler.js';

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());

app.get('/health', (req, res) => res.json({ status: 'ok' }));

app.get('/api/packages/:trackingNumber', getPackageByTracking);
app.post('/api/packages', trackAndSavePackage);

app.use(errorHandler);

async function bootstrap() {
  await connectDB();
  app.listen(PORT, () => {
    console.log(`api_server escuchando en puerto ${PORT}`);
  });
}

bootstrap();
