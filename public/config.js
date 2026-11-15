// Firebase Web SDK configuration: public identifiers, not privileged credentials.
// Demo does not initialize Firebase. Only the controlled deployment enables pilot mode.
// No Analytics initialization: minimize data collection in this health-sector portal.
export const config = {
  mode:'demo',
  firebase:{
    apiKey:"AIzaSyBPVOOM7VQHdJgJ7hI3-fOVD3z-x-RT_gs",
    authDomain:"tramite-discapacidad.firebaseapp.com",
    projectId:"tramite-discapacidad",
    storageBucket:"tramite-discapacidad.firebasestorage.app",
    messagingSenderId:"91732599743",
    appId:"1:91732599743:web:1bb34f5a1cb708b673770a"
  },
  appCheckSiteKey:'',
  region:'us-central1'
};
