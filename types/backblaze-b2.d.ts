declare module "backblaze-b2" {
  export interface B2InitOptions {
    applicationKeyId: string;
    applicationKey: string;
    retry?: {
      retries?: number;
    };
  }

  export interface B2AuthorizeResponse {
    data: {
      accountId: string;
      authorizationToken: string;
      apiUrl: string;
      downloadUrl: string;
      recommendedPartSize: number;
      absoluteMinimumPartSize: number;
    };
  }

  export interface B2Bucket {
    bucketId: string;
    bucketName: string;
    bucketType: string;
  }

  export interface B2ListBucketsResponse {
    data: {
      buckets: B2Bucket[];
    };
  }

  export interface B2FileItem {
    fileId: string;
    fileName: string;
    contentLength: number;
    contentType: string;
    uploadTimestamp: number;
  }

  export interface B2ListFileNamesResponse {
    data: {
      files: B2FileItem[];
      nextFileName?: string;
    };
  }

  export interface B2GetUploadUrlResponse {
    data: {
      bucketId: string;
      uploadUrl: string;
      authorizationToken: string;
    };
  }

  export interface B2UploadFileOptions {
    uploadUrl: string;
    uploadAuthToken: string;
    fileName: string;
    data: Buffer | Uint8Array;
    mime?: string;
    hash?: string;
    info?: Record<string, string>;
  }

  export interface B2UploadFileResponse {
    data: {
      fileId: string;
      fileName: string;
      contentLength: number;
      contentSha1: string;
      contentType: string;
    };
  }

  export interface B2StartLargeFileOptions {
    bucketId: string;
    fileName: string;
    contentType?: string;
  }

  export interface B2StartLargeFileResponse {
    data: {
      fileId: string;
      fileName: string;
      accountId: string;
      bucketId: string;
      contentType: string;
    };
  }

  export interface B2GetUploadPartUrlOptions {
    fileId: string;
  }

  export interface B2GetUploadPartUrlResponse {
    data: {
      uploadUrl: string;
      authorizationToken: string;
    };
  }

  export interface B2UploadPartOptions {
    uploadUrl: string;
    uploadAuthToken: string;
    partNumber: number;
    data: Buffer | Uint8Array;
    hash?: string;
  }

  export interface B2UploadPartResponse {
    data: {
      fileId: string;
      partNumber: number;
      contentLength: number;
      contentSha1: string;
    };
  }

  export interface B2FinishLargeFileOptions {
    fileId: string;
    partSha1Array: string[];
  }

  export interface B2FinishLargeFileResponse {
    data: {
      fileId: string;
      fileName: string;
      contentLength: number;
      contentSha1: string;
      contentType: string;
    };
  }

  export default class B2 {
    constructor(options: B2InitOptions);
    accountId: string;
    authorize(): Promise<B2AuthorizeResponse>;
    listBuckets(args?: Record<string, unknown>): Promise<B2ListBucketsResponse>;
    getBucket(args: { bucketId?: string; bucketName?: string }): Promise<B2ListBucketsResponse>;
    getUploadUrl(args: { bucketId: string }): Promise<B2GetUploadUrlResponse>;
    uploadFile(args: B2UploadFileOptions): Promise<B2UploadFileResponse>;
    startLargeFile(args: B2StartLargeFileOptions): Promise<B2StartLargeFileResponse>;
    getUploadPartUrl(args: B2GetUploadPartUrlOptions): Promise<B2GetUploadPartUrlResponse>;
    uploadPart(args: B2UploadPartOptions): Promise<B2UploadPartResponse>;
    finishLargeFile(args: B2FinishLargeFileOptions): Promise<B2FinishLargeFileResponse>;
    listFileNames(args: { bucketId: string; startFileName?: string; maxFileCount?: number; delimiter?: string; prefix?: string }): Promise<B2ListFileNamesResponse>;
    cancelLargeFile(args: { fileId: string }): Promise<unknown>;
    listFileVersions(args: {
      bucketId: string;
      startFileName?: string;
      startFileId?: string;
      maxFileCount?: number;
      prefix?: string;
    }): Promise<{ data: { files: B2FileItem[]; nextFileName?: string | null; nextFileId?: string | null } }>;
    deleteFileVersion(args: { fileId: string; fileName: string }): Promise<unknown>;
    getDownloadAuthorization(args: {
      bucketId: string;
      fileNamePrefix: string;
      validDurationInSeconds: number;
    }): Promise<{ data: { authorizationToken: string; bucketId: string; fileNamePrefix: string } }>;
  }
}
