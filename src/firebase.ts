import { initializeApp, getApps } from 'firebase/app';
import { getAuth } from 'firebase/auth';
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
export const storage = getStorage(storageApp, `gs://${STORAGE_BUCKET}`);

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
