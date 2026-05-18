const { MongoClient } = require('mongodb');

async function test() {
  const client = new MongoClient(process.env.MONGO_URL || "mongodb+srv://evand:admin@kand.z1wlvpu.mongodb.net/kand?appName=kand");
  await client.connect();
  const db = client.db("kand");
  const upload = await db.collection('uploads').findOne({});
  await client.close();

  if (upload) {
    const dbBuf = upload.bytes.value();
    console.log('DB first 4 bytes:', dbBuf.slice(0, 4).toString('hex'));

    const res = await fetch(`http://localhost:3000/api/uploads/${upload.id}`);
    const buf = await res.arrayBuffer();
    const fetchBuf = Buffer.from(buf);
    console.log('Fetch first 4 bytes:', fetchBuf.slice(0, 4).toString('hex'));
  } else {
    console.log('No uploads found.');
  }
}
test().catch(console.error);
