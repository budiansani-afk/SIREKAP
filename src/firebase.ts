import { initializeApp, getApps } from 'firebase/app';
import {
  getAuth,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  updatePassword,
  updateProfile,
  signOut
} from 'firebase/auth';
import { initializeFirestore, getFirestore, doc, getDocFromServer, Firestore } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';
import firebaseConfig from '../firebase-applet-config.json';

export const STORAGE_PROJECT_ID = 'bidang-pertanahan';
export const STORAGE_BUCKET = 'bidang-pertanahan.firebasestorage.app';

const storageFirebaseConfig = {
  projectId: STORAGE_PROJECT_ID,
  appId: '1:208169868343:web:2124bb1860a530125e33b2',
  apiKey: 'AIzaSyCZCsaPlKCWC_1ZB1J7lcQke5PCKRdLg0c',
  authDomain: 'bidang-pertanahan.firebaseapp.com',
  storageBucket: STORAGE_BUCKET,
  messagingSenderId: '208169868343'
};

const app = getApps().find(a => a.name === '[DEFAULT]') || initializeApp(firebaseConfig);
const storageApp =
  getApps().find(a => a.name === 'sirekap-storage') ||
  initializeApp(storageFirebaseConfig, 'sirekap-storage');
const provisioningApp =
  getApps().find(a => a.name === 'sirekap-user-provisioning') ||
  initializeApp(firebaseConfig, 'sirekap-user-provisioning');

function createFirestoreInstance(): Firestore {
  const databaseId = firebaseConfig.firestoreDatabaseId || undefined;
  try {
    return initializeFirestore(
      app,
      { experimentalAutoDetectLongPolling: true },
      databaseId
    );
  } catch {
    return databaseId ? getFirestore(app, databaseId) : getFirestore(app);
  }
}

export const db = createFirestoreInstance();
export const auth = getAuth(app);
export const provisioningAuth = getAuth(provisioningApp);
export const storage = getStorage(storageApp, `gs://${STORAGE_BUCKET}`);

export interface ProvisionAuthResult {
  status: 'created' | 'already_exists' | 'password_updated';
  uid?: string;
}

/**
 * Mendaftarkan akun ke Firebase Authentication menggunakan instance Auth sekunder
 * agar sesi Administrator yang sedang login tidak ter-logout.
 */
export async function ensureUserInFirebaseAuth(
  email: string,
  password: string,
  displayName?: string,
  previousPassword?: string
): Promise<ProvisionAuthResult> {
  const cleanEmail = email.trim().toLowerCase();
  try {
    const cred = await createUserWithEmailAndPassword(provisioningAuth, cleanEmail, password);
    if (displayName?.trim()) {
      await updateProfile(cred.user, { displayName: displayName.trim() }).catch(() => {});
    }
    const uid = cred.user.uid;
    await signOut(provisioningAuth).catch(() => {});
    return { status: 'created', uid };
  } catch (err: any) {
    if (err?.code === 'auth/email-already-in-use') {
      if (previousPassword && previousPassword !== password) {
        try {
          const cred = await signInWithEmailAndPassword(provisioningAuth, cleanEmail, previousPassword);
          await updatePassword(cred.user, password);
          if (displayName?.trim()) {
            await updateProfile(cred.user, { displayName: displayName.trim() }).catch(() => {});
          }
          const uid = cred.user.uid;
          await signOut(provisioningAuth).catch(() => {});
          return { status: 'password_updated', uid };
        } catch {
          await signOut(provisioningAuth).catch(() => {});
        }
      }
      return { status: 'already_exists' };
    }
    await signOut(provisioningAuth).catch(() => {});
    throw err;
  }
}

export async function testConnection() {
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
  } catch (error) {
    if (error instanceof Error) {
      if (error.message.includes('the client is offline')) {
        console.error('Please check your Firebase configuration.');
      } else if (error.message.includes('Quota exceeded') || error.message.includes('resource-exhausted')) {
        console.error('Firestore quota exceeded:', error.message);
      } else if (error.message.includes('does not exist') || error.message.includes('NOT_FOUND')) {
        console.error('Firestore database does not exist yet on this project:', error.message);
      }
    }
  }
}
testConnection();

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  }
}

export function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo: auth.currentUser?.providerData?.map(provider => ({
        providerId: provider.providerId,
        email: provider.email,
      })) || []
    },
    operationType,
    path
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}
