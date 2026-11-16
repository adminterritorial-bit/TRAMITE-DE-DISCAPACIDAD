// Firebase Web SDK configuration: public identifiers, not privileged credentials.
// The public catalog connects to the existing municipal Spark deployment.
// No Analytics initialization: minimize data collection in this health-sector portal.
export const config = {
  mode:'pilot',
  firebase:{
    apiKey:"AIzaSyBPVOOM7VQHdJgJ7hI3-fOVD3z-x-RT_gs",
    authDomain:"tramite-discapacidad.firebaseapp.com",
    projectId:"tramite-discapacidad",
    storageBucket:"tramite-discapacidad.firebasestorage.app",
    messagingSenderId:"91732599743",
    appId:"1:91732599743:web:1bb34f5a1cb708b673770a"
  },
  appCheckSiteKey:'6Lc9ECIuAAAAACSiEJgol0qC6LjzeunULCI4K2xb',
  region:'us-central1'
};
