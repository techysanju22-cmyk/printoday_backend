import { Request, Response, NextFunction } from 'express';
import { User } from '../models/User';
import { PendingRegistration } from '../models/PendingRegistration';
import { EmailOtp } from '../models/EmailOtp';
import { sendTokenResponse } from '../utils/jwt';
import { sendEmail } from '../config/mailer';

// ─── Helpers ─────────────────────────────────────────────────────────────────

const getStringId = (id: unknown): string => String(id);

const generateOtp = (): string =>
  Math.floor(100000 + Math.random() * 900000).toString();

/** Mask email: sanjay@gmail.com → s****y@gmail.com */
const maskEmail = (email: string): string => {
  const [local, domain] = email.split('@');
  if (local.length <= 2) return `${local[0]}***@${domain}`;
  return `${local[0]}${'*'.repeat(local.length - 2)}${local[local.length - 1]}@${domain}`;
};

// ─── REGISTRATION ─────────────────────────────────────────────────────────────

/**
 * @desc   Step 1 of Registration — validate, check conflicts, save pending, send OTP
 * @route  POST /api/v1/auth/initiate-register
 */
export const initiateRegister = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { email, mobile, accountType, ...rest } = req.body;

    if (!email || !mobile || !accountType) {
      res.status(400).json({ success: false, error: 'Email, mobile, and account type are required.' });
      return;
    }

    // --- Conflict checks ---
    const emailExists = await User.findOne({ email: email.toLowerCase().trim() });
    if (emailExists) {
      res.status(409).json({
        success: false,
        code: 'EMAIL_ALREADY_EXISTS',
        error: 'Email already registered. Please log in.'
      });
      return;
    }

    const mobileExists = await User.findOne({ mobileNumber: mobile });
    if (mobileExists) {
      res.status(409).json({
        success: false,
        code: 'MOBILE_ALREADY_EXISTS',
        error: 'This phone number is linked to an existing account. Please log in or use a different number.'
      });
      return;
    }

    // --- Save pending registration (upsert by email so resend works) ---
    const otp = generateOtp();
    const otpExpires = new Date(Date.now() + 10 * 60 * 1000); // 10 min

    await PendingRegistration.findOneAndUpdate(
      { email: email.toLowerCase().trim() },
      {
        email: email.toLowerCase().trim(),
        mobile,
        otp,
        otpExpires,
        accountType,
        payload: { email: email.toLowerCase().trim(), mobile, accountType, ...rest }
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    // --- Send OTP email ---
    await sendEmail({
      email,
      subject: 'PrinToday – Verify Your Email to Complete Registration',
      message: `Your registration OTP is: ${otp}\n\nThis code expires in 10 minutes. Do not share it with anyone.`
    });

    res.status(200).json({ success: true, message: 'OTP sent to your email. Please verify to complete registration.' });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc   Step 2 of Registration — verify OTP, create User, issue session
 * @route  POST /api/v1/auth/verify-register-otp
 */
export const verifyRegisterOtp = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { email, otp } = req.body;
    if (!email || !otp) {
      res.status(400).json({ success: false, error: 'Email and OTP are required.' });
      return;
    }

    const pending = await PendingRegistration.findOne({ email: email.toLowerCase().trim() });

    if (!pending) {
      res.status(404).json({ success: false, error: 'No pending registration found. Please register again.' });
      return;
    }
    if (pending.otp !== otp) {
      res.status(401).json({ success: false, error: 'Invalid OTP.' });
      return;
    }
    if (pending.otpExpires < new Date()) {
      await pending.deleteOne();
      res.status(410).json({ success: false, error: 'OTP has expired. Please register again.' });
      return;
    }

    const { accountType, payload } = pending;
    const { mobile, name, companyName, contactName, designation, address, gstin, hasGstin } = payload as Record<string, any>;

    // Build user document
    const userDoc: Record<string, unknown> = {
      email: pending.email,
      mobileNumber: mobile,
      accountType,
    };

    if (accountType === 'INDIVIDUAL') {
      userDoc.individual = { name, address };
    } else {
      userDoc.organization = {
        companyName,
        contactName,
        designation,
        address,
        gstin,
        hasGstin: !!hasGstin,
        physicalVerificationStatus: 'PENDING',
        creditEligible: false
      };
    }

    const user = await User.create(userDoc);
    await pending.deleteOne(); // clean up

    sendTokenResponse(getStringId(user._id), 201, res);
  } catch (error) {
    next(error);
  }
};

// ─── LOGIN ────────────────────────────────────────────────────────────────────

/**
 * @desc   Send login OTP to a registered email
 * @route  POST /api/v1/auth/send-login-otp
 */
export const sendLoginOtp = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { email } = req.body;
    if (!email) {
      res.status(400).json({ success: false, error: 'Email is required.' });
      return;
    }

    const user = await User.findOne({ email: email.toLowerCase().trim() });
    if (!user) {
      res.status(404).json({ success: false, error: 'No account found with this email.' });
      return;
    }

    const otp = generateOtp();
    await EmailOtp.deleteMany({ email }); // clear old OTPs
    await EmailOtp.create({ email, otp });

    await sendEmail({
      email,
      subject: 'PrinToday – Your Login OTP',
      message: `Your login OTP is: ${otp}\n\nThis code expires in 5 minutes. Do not share it with anyone.`
    });

    res.status(200).json({ success: true, message: 'OTP sent to your email.' });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc   Verify login OTP and issue session cookie
 * @route  POST /api/v1/auth/verify-login-otp
 */
export const verifyLoginOtp = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { email, otp } = req.body;
    if (!email || !otp) {
      res.status(400).json({ success: false, error: 'Email and OTP are required.' });
      return;
    }

    const emailOtp = await EmailOtp.findOne({ email: email.toLowerCase().trim(), otp });
    if (!emailOtp) {
      res.status(401).json({ success: false, error: 'Invalid or expired OTP.' });
      return;
    }

    const user = await User.findOne({ email: email.toLowerCase().trim() });
    if (!user) {
      res.status(404).json({ success: false, error: 'Account not found.' });
      return;
    }

    await emailOtp.deleteOne();
    sendTokenResponse(getStringId(user._id), 200, res);
  } catch (error) {
    next(error);
  }
};

// ─── FORGOT EMAIL ─────────────────────────────────────────────────────────────

/**
 * @desc   Find account by mobile, return masked email, send Login OTP
 * @route  POST /api/v1/auth/find-account
 */
export const findAccount = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { mobile } = req.body;
    if (!mobile) {
      res.status(400).json({ success: false, error: 'Mobile number is required.' });
      return;
    }

    const user = await User.findOne({ mobileNumber: mobile });
    if (!user) {
      res.status(404).json({ success: false, error: 'No account found with this mobile number.' });
      return;
    }

    // Send OTP to the real email
    const otp = generateOtp();
    await EmailOtp.deleteMany({ email: user.email });
    await EmailOtp.create({ email: user.email, otp });

    await sendEmail({
      email: user.email,
      subject: 'PrinToday – Your Login OTP',
      message: `Your login OTP is: ${otp}\n\nThis code expires in 5 minutes. Do not share it with anyone.`
    });

    res.status(200).json({
      success: true,
      maskedEmail: maskEmail(user.email),
      message: 'OTP sent to your registered email.'
    });
  } catch (error) {
    next(error);
  }
};

// ─── SESSION ──────────────────────────────────────────────────────────────────

/**
 * @desc   Logout
 * @route  POST /api/v1/auth/logout
 */
export const logout = (_req: Request, res: Response): void => {
  res.cookie('token', 'none', {
    expires: new Date(Date.now() + 10 * 1000),
    httpOnly: true,
  });
  res.status(200).json({ success: true, data: {} });
};

/**
 * @desc   Get current logged-in user
 * @route  GET /api/v1/auth/me
 */
export const getMe = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const user = await User.findById(req.user?._id).select('-password');
    res.status(200).json({ success: true, data: user });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc   Update user profile
 * @route  PUT /api/v1/auth/profile
 */
export const updateProfile = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const user = await User.findById(req.user?._id);
    if (!user) {
      res.status(404).json({ success: false, error: 'User not found' });
      return;
    }

    const { individual, organization } = req.body;

    if (user.accountType === 'INDIVIDUAL' && individual) {
      user.individual = {
        ...user.individual,
        ...individual
      };
    } else if (user.accountType === 'ORGANIZATION' && organization) {
      // Prevent overriding sensitive organization fields
      user.organization = {
        ...user.organization,
        ...organization,
        physicalVerificationStatus: user.organization?.physicalVerificationStatus || 'PENDING',
        creditEligible: user.organization?.creditEligible || false
      };
    }

    await user.save();
    res.status(200).json({ success: true, data: user });
  } catch (error) {
    next(error);
  }
};
