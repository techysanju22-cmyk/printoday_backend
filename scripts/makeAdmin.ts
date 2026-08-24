import mongoose from 'mongoose';
import { User } from '../src/models/User';
import dotenv from 'dotenv';
import path from 'path';

// Load env vars
dotenv.config({ path: path.resolve(__dirname, '../.env') });

const makeAdmin = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/printoday');
    console.log('MongoDB Connected');

    const email = 'techysanju52@gmail.com';

    let user = await User.findOne({ email });

    if (user) {
      user.role = 'ADMIN';
      await user.save();
      console.log(`Existing user ${email} upgraded to ADMIN.`);
    } else {
      user = await User.create({
        email,
        role: 'ADMIN',
        accountType: 'INDIVIDUAL',
        mobileNumber: '9999999999',
        individual: {
          name: 'Super Admin',
          address: {
            houseNo: '1',
            streetName: 'Admin Street',
            area: 'Admin Area',
            pin: '000000'
          }
        }
      });
      console.log(`Created new ADMIN user: ${email}`);
    }

    process.exit(0);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
};

makeAdmin();
