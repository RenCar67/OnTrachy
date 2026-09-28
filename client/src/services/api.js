import axios from 'axios';

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || 'http://localhost:5000'
});

export async function trackPackage(trackingNumber, title) {
  const { data } = await api.post('/api/packages', { trackingNumber, title });
  return data;
}

export async function getPackage(trackingNumber) {
  const { data } = await api.get(`/api/packages/${trackingNumber}`);
  return data;
}
