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
 * @desc   Register user directly
 * @route  POST /api/v1/auth/register
 */
export const register = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { email, mobile, accountType, name, companyName, contactName, designation, address, gstin, hasGstin, addressProofUrl } = req.body;

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

    // Build user document
    const userDoc: Record<string, unknown> = {
      email: email.toLowerCase().trim(),
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
        addressProofUrl,
        physicalVerificationStatus: 'PENDING',
        creditEligible: false
      };
    }

    const user = await User.create(userDoc);
    sendTokenResponse(getStringId(user._id), 201, res);
  } catch (error) {
    next(error);
  }
};

// ─── LOGIN ────────────────────────────────────────────────────────────────────

/**
 * @desc   Login user directly by email or mobile number
 * @route  POST /api/v1/auth/login
 */
export const login = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { identifier } = req.body;
    if (!identifier) {
      res.status(400).json({ success: false, error: 'Email or mobile number is required.' });
      return;
    }

    const cleanIdentifier = identifier.toLowerCase().trim();

    // Check if it's an email or phone number
    let user;
    if (cleanIdentifier.includes('@')) {
      user = await User.findOne({ email: cleanIdentifier });
    } else {
      user = await User.findOne({ mobileNumber: cleanIdentifier });
    }

    if (!user) {
      res.status(404).json({ success: false, error: 'No account found with this email or mobile number.' });
      return;
    }

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
