/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import * as assert from 'assert';
import { Emitter } from 'vs/base/common/event';
import { TPromise } from 'vs/base/common/winjs.base';
import { TelemetryService } from 'vs/platform/telemetry/common/telemetryService';
import ErrorTelemetry from 'vs/platform/telemetry/browser/errorTelemetry';
import { NullAppender, ITelemetryAppender } from 'vs/platform/telemetry/common/telemetryUtils';
import * as Errors from 'vs/base/common/errors';
import * as sinon from 'sinon';
import { getConfigurationValue } from 'vs/platform/configuration/common/configuration';

const optInStatusEventName: string = 'optInStatus';

class TestTelemetryAppender implements ITelemetryAppender {

	public events: any[];
	public isDisposed: boolean;

	constructor() {
		this.events = [];
		this.isDisposed = false;
	}

	public log(eventName: string, data?: any): void {
		this.events.push({ eventName, data });
	}

	public getEventsCount() {
		return this.events.length;
	}

	public dispose() {
		this.isDisposed = true;
	}
}

class ErrorTestingSettings {
	public personalInfo;
	public importantInfo;
	public filePrefix;
	public dangerousPathWithoutImportantInfo;
	public dangerousPathWithImportantInfo;
	public missingModelPrefix;
	public missingModelMessage;
	public noSuchFilePrefix;
	public noSuchFileMessage;
	public stack;

	constructor() {
		this.personalInfo = 'DANGEROUS/PATH';
		this.importantInfo = 'important/information';
		this.filePrefix = 'file:///';
		this.dangerousPathWithImportantInfo = this.filePrefix + this.personalInfo + '/resources/app/' + this.importantInfo;
		this.dangerousPathWithoutImportantInfo = this.filePrefix + this.personalInfo;

		this.missingModelPrefix = 'Received model events for missing model ';
		this.missingModelMessage = this.missingModelPrefix + ' ' + this.dangerousPathWithoutImportantInfo;

		this.noSuchFilePrefix = 'ENOENT: no such file or directory';
		this.noSuchFileMessage = this.noSuchFilePrefix + ' \'' + this.personalInfo + '\'';

		this.stack = ['at e._modelEvents (a/path/that/doesnt/contain/code/names.js:11:7309)',
			'    at t.AllWorkers (a/path/that/doesnt/contain/code/names.js:6:8844)',
			'    at e.(anonymous function) [as _modelEvents] (a/path/that/doesnt/contain/code/names.js:5:29552)',
			'    at Function.<anonymous> (a/path/that/doesnt/contain/code/names.js:6:8272)',
			'    at e.dispatch (a/path/that/doesnt/contain/code/names.js:5:26931)',
			'    at e.request (a/path/that/doesnt/contain/code/names.js:14:1745)',
			'    at t._handleMessage (another/path/that/doesnt/contain/code/names.js:14:17447)',
			'    at t._onmessage (another/path/that/doesnt/contain/code/names.js:14:16976)',
			'    at t.onmessage (another/path/that/doesnt/contain/code/names.js:14:15854)',
			'    at DedicatedWorkerGlobalScope.self.onmessage',
			this.dangerousPathWithImportantInfo,
			this.dangerousPathWithoutImportantInfo,
			this.missingModelMessage,
			this.noSuchFileMessage];
	}
}

suite('TelemetryService', () => {

	test('Disposing', sinon.test(function () {
		let testAppender = new TestTelemetryAppender();
		let service = new TelemetryService({ appender: testAppender }, undefined);

		return service.publicLog('testPrivateEvent').then(() => {
			assert.equal(testAppender.getEventsCount(), 1);

			service.dispose();
			assert.equal(!testAppender.isDisposed, true);
		});
	}));

	// event reporting
	test('Simple event', sinon.test(function () {
		let testAppender = new TestTelemetryAppender();
		let service = new TelemetryService({ appender: testAppender }, undefined);

		return service.publicLog('testEvent').then(_ => {
			assert.equal(testAppender.getEventsCount(), 1);
			assert.equal(testAppender.events[0].eventName, 'testEvent');
			assert.notEqual(testAppender.events[0].data, null);

			service.dispose();
		});
	}));

	test('Event with data', sinon.test(function () {
		let testAppender = new TestTelemetryAppender();
		let service = new TelemetryService({ appender: testAppender }, undefined);

		return service.publicLog('testEvent', {
			'stringProp': 'property',
			'numberProp': 1,
			'booleanProp': true,
			'complexProp': {
				'value': 0
			}
		}).then(() => {
			assert.equal(testAppender.getEventsCount(), 1);
			assert.equal(testAppender.events[0].eventName, 'testEvent');
			assert.notEqual(testAppender.events[0].data, null);
			assert.equal(testAppender.events[0].data['stringProp'], 'property');
			assert.equal(testAppender.events[0].data['numberProp'], 1);
			assert.equal(testAppender.events[0].data['booleanProp'], true);
			assert.equal(testAppender.events[0].data['complexProp'].value, 0);

			service.dispose();
		});

	}));

	test('common properties added to *all* events, simple event', function () {
		let testAppender = new TestTelemetryAppender();
		let service = new TelemetryService({
			appender: testAppender,
			commonProperties: TPromise.as({ foo: 'JA!', get bar() { return Math.random(); } })
		}, undefined);

		return service.publicLog('testEvent').then(_ => {
			let [first] = testAppender.events;

			assert.equal(Object.keys(first.data).length, 2);
			assert.equal(typeof first.data['foo'], 'string');
			assert.equal(typeof first.data['bar'], 'number');

			service.dispose();
		});
	});

	test('common properties added to *all* events, event with data', function () {
		let testAppender = new TestTelemetryAppender();
		let service = new TelemetryService({
			appender: testAppender,
			commonProperties: TPromise.as({ foo: 'JA!', get bar() { return Math.random(); } })
		}, undefined);

		return service.publicLog('testEvent', { hightower: 'xl', price: 8000 }).then(_ => {
			let [first] = testAppender.events;

			assert.equal(Object.keys(first.data).length, 4);
			assert.equal(typeof first.data['foo'], 'string');
			assert.equal(typeof first.data['bar'], 'number');
			assert.equal(typeof first.data['hightower'], 'string');
			assert.equal(typeof first.data['price'], 'number');

			service.dispose();
		});
	});

	test('TelemetryInfo comes from properties', function () {
		let service = new TelemetryService({
			appender: NullAppender,
			commonProperties: TPromise.as({
				sessionID: 'one',
				['common.instanceId']: 'two',
				['common.machineId']: 'three',
			})
		}, undefined);

		return service.getTelemetryInfo().then(info => {
			assert.equal(info.sessionId, 'one');
			assert.equal(info.instanceId, 'two');
			assert.equal(info.machineId, 'three');

			service.dispose();
		});
	});

	test('enableTelemetry on by default', sinon.test(function () {
		let testAppender = new TestTelemetryAppender();
		let service = new TelemetryService({ appender: testAppender }, undefined);

		return service.publicLog('testEvent').then(() => {
			assert.equal(testAppender.getEventsCount(), 1);
			assert.equal(testAppender.events[0].eventName, 'testEvent');

			service.dispose();
		});
	}));

	test('Error events', sinon.test(function () {

		let origErrorHandler = Errors.errorHandler.getUnexpectedErrorHandler();
		Errors.setUnexpectedErrorHandler(() => { });

		try {
			let testAppender = new TestTelemetryAppender();
			let service = new TelemetryService({ appender: testAppender }, undefined);
			const errorTelemetry = new ErrorTelemetry(service);


			let e: any = new Error('This is a test.');
			// for Phantom
			if (!e.stack) {
				e.stack = 'blah';
			}

			Errors.onUnexpectedError(e);
			this.clock.tick(ErrorTelemetry.ERROR_FLUSH_TIMEOUT);
			assert.equal(testAppender.getEventsCount(), 1);
			assert.equal(testAppender.events[0].eventName, 'UnhandledError');
			assert.equal(testAppender.events[0].data.message, 'This is a test.');

			errorTelemetry.dispose();
			service.dispose();
		} finally {
			Errors.setUnexpectedErrorHandler(origErrorHandler);
		}
	}));

	// 	test('Unhandled Promise Error events', sinon.test(function() {
	//
	// 		let origErrorHandler = Errors.errorHandler.getUnexpectedErrorHandler();
	// 		Errors.setUnexpectedErrorHandler(() => {});
	//
	// 		try {
	// 			let service = new MainTelemetryService();
	// 			let testAppender = new TestTelemetryAppender();
	// 			service.addTelemetryAppender(testAppender);
	//
	// 			winjs.Promise.wrapError(new Error('This should not get logged'));
	// 			winjs.TPromise.as(true).then(() => {
	// 				throw new Error('This should get logged');
	// 			});
	// 			// prevent console output from failing the test
	// 			this.stub(console, 'log');
	// 			// allow for the promise to finish
	// 			this.clock.tick(MainErrorTelemetry.ERROR_FLUSH_TIMEOUT);
	//
	// 			assert.equal(testAppender.getEventsCount(), 1);
	// 			assert.equal(testAppender.events[0].eventName, 'UnhandledError');
	// 			assert.equal(testAppender.events[0].data.message,  'This should get logged');
	//
	// 			service.dispose();
	// 		} finally {
	// 			Errors.setUnexpectedErrorHandler(origErrorHandler);
	// 		}
	// 	}));

	test('Handle global errors', sinon.test(function () {
		let errorStub = sinon.stub();
		window.onerror = errorStub;

		let testAppender = new TestTelemetryAppender();
		let service = new TelemetryService({ appender: testAppender }, undefined);
		const errorTelemetry = new ErrorTelemetry(service);

		let testError = new Error('test');
		(<any>window.onerror)('Error Message', 'file.js', 2, 42, testError);
		this.clock.tick(ErrorTelemetry.ERROR_FLUSH_TIMEOUT);

		assert.equal(errorStub.alwaysCalledWithExactly('Error Message', 'file.js', 2, 42, testError), true);
		assert.equal(errorStub.callCount, 1);

		assert.equal(testAppender.getEventsCount(), 1);
		assert.equal(testAppender.events[0].eventName, 'UnhandledError');
		assert.equal(testAppender.events[0].data.message, 'Error Message');
		assert.equal(testAppender.events[0].data.filename, 'file.js');
		assert.equal(testAppender.events[0].data.line, 2);
		assert.equal(testAppender.events[0].data.column, 42);
		assert.equal(testAppender.events[0].data.error.message, 'test');

		errorTelemetry.dispose();
		service.dispose();
	}));

	test('Uncaught Error Telemetry removes PII from filename', sinon.test(function () {
		let errorStub = sinon.stub();
		window.onerror = errorStub;
		let settings = new ErrorTestingSettings();
		let testAppender = new TestTelemetryAppender();
		let service = new TelemetryService({ appender: testAppender }, undefined);
		const errorTelemetry = new ErrorTelemetry(service);

		let dangerousFilenameError: any = new Error('dangerousFilename');
		dangerousFilenameError.stack = settings.stack;
		(<any>window.onerror)('dangerousFilename', settings.dangerousPathWithImportantInfo + '/test.js', 2, 42, dangerousFilenameError);
		this.clock.tick(ErrorTelemetry.ERROR_FLUSH_TIMEOUT);

		assert.equal(errorStub.callCount, 1);
		assert.equal(testAppender.events[0].data.filename.indexOf(settings.dangerousPathWithImportantInfo), -1);

		dangerousFilenameError = new Error('dangerousFilename');
		dangerousFilenameError.stack = settings.stack;
		(<any>window.onerror)('dangerousFilename', settings.dangerousPathWithImportantInfo + '/test.js', 2, 42, dangerousFilenameError);
		this.clock.tick(ErrorTelemetry.ERROR_FLUSH_TIMEOUT);

		assert.equal(errorStub.callCount, 2);
		assert.equal(testAppender.events[0].data.filename.indexOf(settings.dangerousPathWithImportantInfo), -1);
		assert.equal(testAppender.events[0].data.filename, settings.importantInfo + '/test.js');

		errorTelemetry.dispose();
		service.dispose();
	}));

	test('Unexpected Error Telemetry removes PII', sinon.test(function () {
		let origErrorHandler = Errors.errorHandler.getUnexpectedErrorHandler();
		Errors.setUnexpectedErrorHandler(() => { });
		try {
			let settings = new ErrorTestingSettings();
			let testAppender = new TestTelemetryAppender();
			let service = new TelemetryService({ appender: testAppender }, undefined);
			const errorTelemetry = new ErrorTelemetry(service);

			let dangerousPathWithoutImportantInfoError: any = new Error(settings.dangerousPathWithoutImportantInfo);
			dangerousPathWithoutImportantInfoError.stack = settings.stack;
			Errors.onUnexpectedError(dangerousPathWithoutImportantInfoError);
			this.clock.tick(ErrorTelemetry.ERROR_FLUSH_TIMEOUT);

			assert.equal(testAppender.events[0].data.message.indexOf(settings.personalInfo), -1);
			assert.equal(testAppender.events[0].data.message.indexOf(settings.filePrefix), -1);

			assert.equal(testAppender.events[0].data.stack.indexOf(settings.personalInfo), -1);
			assert.equal(testAppender.events[0].data.stack.indexOf(settings.filePrefix), -1);
			assert.notEqual(testAppender.events[0].data.stack.indexOf(settings.stack[4]), -1);
			assert.equal(testAppender.events[0].data.stack.split('\n').length, settings.stack.length);

			errorTelemetry.dispose();
			service.dispose();
		}
		finally {
			Errors.setUnexpectedErrorHandler(origErrorHandler);
		}
	}));

	test('Uncaught Error Telemetry removes PII', sinon.test(function () {
		let errorStub = sinon.stub();
		window.onerror = errorStub;
		let settings = new ErrorTestingSettings();
		let testAppender = new TestTelemetryAppender();
		let service = new TelemetryService({ appender: testAppender }, undefined);
		const errorTelemetry = new ErrorTelemetry(service);

		let dangerousPathWithoutImportantInfoError: any = new Error('dangerousPathWithoutImportantInfo');
		dangerousPathWithoutImportantInfoError.stack = settings.stack;
		(<any>window.onerror)(settings.dangerousPathWithoutImportantInfo, 'test.js', 2, 42, dangerousPathWithoutImportantInfoError);
		this.clock.tick(ErrorTelemetry.ERROR_FLUSH_TIMEOUT);

		assert.equal(errorStub.callCount, 1);
		// Test that no file information remains, esp. personal info
		assert.equal(testAppender.events[0].data.message.indexOf(settings.personalInfo), -1);
		assert.equal(testAppender.events[0].data.message.indexOf(settings.filePrefix), -1);
		assert.equal(testAppender.events[0].data.stack.indexOf(settings.personalInfo), -1);
		assert.equal(testAppender.events[0].data.stack.indexOf(settings.filePrefix), -1);
		assert.notEqual(testAppender.events[0].data.stack.indexOf(settings.stack[4]), -1);
		assert.equal(testAppender.events[0].data.stack.split('\n').length, settings.stack.length);

		errorTelemetry.dispose();
		service.dispose();
	}));

	test('Unexpected Error Telemetry removes PII but preserves Code file path', sinon.test(function () {

		let origErrorHandler = Errors.errorHandler.getUnexpectedErrorHandler();
		Errors.setUnexpectedErrorHandler(() => { });

		try {
			let settings = new ErrorTestingSettings();
			let testAppender = new TestTelemetryAppender();
			let service = new TelemetryService({ appender: testAppender }, undefined);
			const errorTelemetry = new ErrorTelemetry(service);

			let dangerousPathWithImportantInfoError: any = new Error(settings.dangerousPathWithImportantInfo);
			dangerousPathWithImportantInfoError.stack = settings.stack;

			// Test that important information remains but personal info does not
			Errors.onUnexpectedError(dangerousPathWithImportantInfoError);
			this.clock.tick(ErrorTelemetry.ERROR_FLUSH_TIMEOUT);

			assert.notEqual(testAppender.events[0].data.message.indexOf(settings.importantInfo), -1);
			assert.equal(testAppender.events[0].data.message.indexOf(settings.personalInfo), -1);
			assert.equal(testAppender.events[0].data.message.indexOf(settings.filePrefix), -1);
			assert.notEqual(testAppender.events[0].data.stack.indexOf(settings.importantInfo), -1);
			assert.equal(testAppender.events[0].data.stack.indexOf(settings.personalInfo), -1);
			assert.equal(testAppender.events[0].data.stack.indexOf(settings.filePrefix), -1);
			assert.notEqual(testAppender.events[0].data.stack.indexOf(settings.stack[4]), -1);
			assert.equal(testAppender.events[0].data.stack.split('\n').length, settings.stack.length);

			errorTelemetry.dispose();
			service.dispose();
		}
		finally {
			Errors.setUnexpectedErrorHandler(origErrorHandler);
		}
	}));

	test('Uncaught Error Telemetry removes PII but preserves Code file path', sinon.test(function () {
		let errorStub = sinon.stub();
		window.onerror = errorStub;
		let settings = new ErrorTestingSettings();
		let testAppender = new TestTelemetryAppender();
		let service = new TelemetryService({ appender: testAppender }, undefined);
		const errorTelemetry = new ErrorTelemetry(service);

		let dangerousPathWithImportantInfoError: any = new Error('dangerousPathWithImportantInfo');
		dangerousPathWithImportantInfoError.stack = settings.stack;
		(<any>window.onerror)(settings.dangerousPathWithImportantInfo, 'test.js', 2, 42, dangerousPathWithImportantInfoError);
		this.clock.tick(ErrorTelemetry.ERROR_FLUSH_TIMEOUT);

		assert.equal(errorStub.callCount, 1);
		// Test that important information remains but personal info does not
		assert.notEqual(testAppender.events[0].data.message.indexOf(settings.importantInfo), -1);
		assert.equal(testAppender.events[0].data.message.indexOf(settings.personalInfo), -1);
		assert.equal(testAppender.events[0].data.message.indexOf(settings.filePrefix), -1);
		assert.notEqual(testAppender.events[0].data.stack.indexOf(settings.importantInfo), -1);
		assert.equal(testAppender.events[0].data.stack.indexOf(settings.personalInfo), -1);
		assert.equal(testAppender.events[0].data.stack.indexOf(settings.filePrefix), -1);
		assert.notEqual(testAppender.events[0].data.stack.indexOf(settings.stack[4]), -1);
		assert.equal(testAppender.events[0].data.stack.split('\n').length, settings.stack.length);

		errorTelemetry.dispose();
		service.dispose();
	}));

	test('Unexpected Error Telemetry removes PII but preserves Code file path when PIIPath is configured', sinon.test(function () {

		let origErrorHandler = Errors.errorHandler.getUnexpectedErrorHandler();
		Errors.setUnexpectedErrorHandler(() => { });

		try {
			let settings = new ErrorTestingSettings();
			let testAppender = new TestTelemetryAppender();
			let service = new TelemetryService({ appender: testAppender, piiPaths: [settings.personalInfo + '/resources/app/'] }, undefined);
			const errorTelemetry = new ErrorTelemetry(service);

			let dangerousPathWithImportantInfoError: any = new Error(settings.dangerousPathWithImportantInfo);
			dangerousPathWithImportantInfoError.stack = settings.stack;

			// Test that important information remains but personal info does not
			Errors.onUnexpectedError(dangerousPathWithImportantInfoError);
			this.clock.tick(ErrorTelemetry.ERROR_FLUSH_TIMEOUT);

			assert.notEqual(testAppender.events[0].data.message.indexOf(settings.importantInfo), -1);
			assert.equal(testAppender.events[0].data.message.indexOf(settings.personalInfo), -1);
			assert.equal(testAppender.events[0].data.message.indexOf(settings.filePrefix), -1);
			assert.notEqual(testAppender.events[0].data.stack.indexOf(settings.importantInfo), -1);
			assert.equal(testAppender.events[0].data.stack.indexOf(settings.personalInfo), -1);
			assert.equal(testAppender.events[0].data.stack.indexOf(settings.filePrefix), -1);
			assert.notEqual(testAppender.events[0].data.stack.indexOf(settings.stack[4]), -1);
			assert.equal(testAppender.events[0].data.stack.split('\n').length, settings.stack.length);

			errorTelemetry.dispose();
			service.dispose();
		}
		finally {
			Errors.setUnexpectedErrorHandler(origErrorHandler);
		}
	}));

	test('Uncaught Error Telemetry removes PII but preserves Code file path when PIIPath is configured', sinon.test(function () {
		let errorStub = sinon.stub();
		window.onerror = errorStub;
		let settings = new ErrorTestingSettings();
		let testAppender = new TestTelemetryAppender();
		let service = new TelemetryService({ appender: testAppender, piiPaths: [settings.personalInfo + '/resources/app/'] }, undefined);
		const errorTelemetry = new ErrorTelemetry(service);

		let dangerousPathWithImportantInfoError: any = new Error('dangerousPathWithImportantInfo');
		dangerousPathWithImportantInfoError.stack = settings.stack;
		(<any>window.onerror)(settings.dangerousPathWithImportantInfo, 'test.js', 2, 42, dangerousPathWithImportantInfoError);
		this.clock.tick(ErrorTelemetry.ERROR_FLUSH_TIMEOUT);

		assert.equal(errorStub.callCount, 1);
		// Test that important information remains but personal info does not
		assert.notEqual(testAppender.events[0].data.message.indexOf(settings.importantInfo), -1);
		assert.equal(testAppender.events[0].data.message.indexOf(settings.personalInfo), -1);
		assert.equal(testAppender.events[0].data.message.indexOf(settings.filePrefix), -1);
		assert.notEqual(testAppender.events[0].data.stack.indexOf(settings.importantInfo), -1);
		assert.equal(testAppender.events[0].data.stack.indexOf(settings.personalInfo), -1);
		assert.equal(testAppender.events[0].data.stack.indexOf(settings.filePrefix), -1);
		assert.notEqual(testAppender.events[0].data.stack.indexOf(settings.stack[4]), -1);
		assert.equal(testAppender.events[0].data.stack.split('\n').length, settings.stack.length);

		errorTelemetry.dispose();
		service.dispose();
	}));

	test('Unexpected Error Telemetry removes PII but preserves Missing Model error message', sinon.test(function () {

		let origErrorHandler = Errors.errorHandler.getUnexpectedErrorHandler();
		Errors.setUnexpectedErrorHandler(() => { });

		try {
			let settings = new ErrorTestingSettings();
			let testAppender = new TestTelemetryAppender();
			let service = new TelemetryService({ appender: testAppender }, undefined);
			const errorTelemetry = new ErrorTelemetry(service);

			let missingModelError: any = new Error(settings.missingModelMessage);
			missingModelError.stack = settings.stack;

			// Test that no file information remains, but this particular
			// error message does (Received model events for missing model)
			Errors.onUnexpectedError(missingModelError);
			this.clock.tick(ErrorTelemetry.ERROR_FLUSH_TIMEOUT);

			assert.notEqual(testAppender.events[0].data.message.indexOf(settings.missingModelPrefix), -1);
			assert.equal(testAppender.events[0].data.message.indexOf(settings.personalInfo), -1);
			assert.equal(testAppender.events[0].data.message.indexOf(settings.filePrefix), -1);
			assert.notEqual(testAppender.events[0].data.stack.indexOf(settings.missingModelPrefix), -1);
			assert.equal(testAppender.events[0].data.stack.indexOf(settings.personalInfo), -1);
			assert.equal(testAppender.events[0].data.stack.indexOf(settings.filePrefix), -1);
			assert.notEqual(testAppender.events[0].data.stack.indexOf(settings.stack[4]), -1);
			assert.equal(testAppender.events[0].data.stack.split('\n').length, settings.stack.length);

			errorTelemetry.dispose();
			service.dispose();
		} finally {
			Errors.setUnexpectedErrorHandler(origErrorHandler);
		}
	}));

	test('Uncaught Error Telemetry removes PII but preserves Missing Model error message', sinon.test(function () {
		let errorStub = sinon.stub();
		window.onerror = errorStub;
		let settings = new ErrorTestingSettings();
		let testAppender = new TestTelemetryAppender();
		let service = new TelemetryService({ appender: testAppender }, undefined);
		const errorTelemetry = new ErrorTelemetry(service);

		let missingModelError: any = new Error('missingModelMessage');
		missingModelError.stack = settings.stack;
		(<any>window.onerror)(settings.missingModelMessage, 'test.js', 2, 42, missingModelError);
		this.clock.tick(ErrorTelemetry.ERROR_FLUSH_TIMEOUT);

		assert.equal(errorStub.callCount, 1);
		// Test that no file information remains, but this particular
		// error message does (Received model events for missing model)
		assert.notEqual(testAppender.events[0].data.message.indexOf(settings.missingModelPrefix), -1);
		assert.equal(testAppender.events[0].data.message.indexOf(settings.personalInfo), -1);
		assert.equal(testAppender.events[0].data.message.indexOf(settings.filePrefix), -1);
		assert.notEqual(testAppender.events[0].data.stack.indexOf(settings.missingModelPrefix), -1);
		assert.equal(testAppender.events[0].data.stack.indexOf(settings.personalInfo), -1);
		assert.equal(testAppender.events[0].data.stack.indexOf(settings.filePrefix), -1);
		assert.notEqual(testAppender.events[0].data.stack.indexOf(settings.stack[4]), -1);
		assert.equal(testAppender.events[0].data.stack.split('\n').length, settings.stack.length);

		errorTelemetry.dispose();
		service.dispose();
	}));

	test('Unexpected Error Telemetry removes PII but preserves No Such File error message', sinon.test(function () {

		let origErrorHandler = Errors.errorHandler.getUnexpectedErrorHandler();
		Errors.setUnexpectedErrorHandler(() => { });

		try {
			let settings = new ErrorTestingSettings();
			let testAppender = new TestTelemetryAppender();
			let service = new TelemetryService({ appender: testAppender }, undefined);
			const errorTelemetry = new ErrorTelemetry(service);

			let noSuchFileError: any = new Error(settings.noSuchFileMessage);
			noSuchFileError.stack = settings.stack;

			// Test that no file information remains, but this particular
			// error message does (ENOENT: no such file or directory)
			Errors.onUnexpectedError(noSuchFileError);
			this.clock.tick(ErrorTelemetry.ERROR_FLUSH_TIMEOUT);

			assert.notEqual(testAppender.events[0].data.message.indexOf(settings.noSuchFilePrefix), -1);
			assert.equal(testAppender.events[0].data.message.indexOf(settings.personalInfo), -1);
			assert.equal(testAppender.events[0].data.message.indexOf(settings.filePrefix), -1);
			assert.notEqual(testAppender.events[0].data.stack.indexOf(settings.noSuchFilePrefix), -1);
			assert.equal(testAppender.events[0].data.stack.indexOf(settings.personalInfo), -1);
			assert.equal(testAppender.events[0].data.stack.indexOf(settings.filePrefix), -1);
			assert.notEqual(testAppender.events[0].data.stack.indexOf(settings.stack[4]), -1);
			assert.equal(testAppender.events[0].data.stack.split('\n').length, settings.stack.length);

			errorTelemetry.dispose();
			service.dispose();
		} finally {
			Errors.setUnexpectedErrorHandler(origErrorHandler);
		}
	}));

	test('Uncaught Error Telemetry removes PII but preserves No Such File error message', sinon.test(function () {
		let origErrorHandler = Errors.errorHandler.getUnexpectedErrorHandler();
		Errors.setUnexpectedErrorHandler(() => { });

		try {
			let errorStub = sinon.stub();
			window.onerror = errorStub;
			let settings = new ErrorTestingSettings();
			let testAppender = new TestTelemetryAppender();
			let service = new TelemetryService({ appender: testAppender }, undefined);
			const errorTelemetry = new ErrorTelemetry(service);

			let noSuchFileError: any = new Error('noSuchFileMessage');
			noSuchFileError.stack = settings.stack;
			(<any>window.onerror)(settings.noSuchFileMessage, 'test.js', 2, 42, noSuchFileError);
			this.clock.tick(ErrorTelemetry.ERROR_FLUSH_TIMEOUT);

			assert.equal(errorStub.callCount, 1);
			// Test that no file information remains, but this particular
			// error message does (ENOENT: no such file or directory)
			Errors.onUnexpectedError(noSuchFileError);
			assert.notEqual(testAppender.events[0].data.message.indexOf(settings.noSuchFilePrefix), -1);
			assert.equal(testAppender.events[0].data.message.indexOf(settings.personalInfo), -1);
			assert.equal(testAppender.events[0].data.message.indexOf(settings.filePrefix), -1);
			assert.notEqual(testAppender.events[0].data.stack.indexOf(settings.noSuchFilePrefix), -1);
			assert.equal(testAppender.events[0].data.stack.indexOf(settings.personalInfo), -1);
			assert.equal(testAppender.events[0].data.stack.indexOf(settings.filePrefix), -1);
			assert.notEqual(testAppender.events[0].data.stack.indexOf(settings.stack[4]), -1);
			assert.equal(testAppender.events[0].data.stack.split('\n').length, settings.stack.length);

			errorTelemetry.dispose();
			service.dispose();
		} finally {
			Errors.setUnexpectedErrorHandler(origErrorHandler);
		}
	}));

	test('Telemetry Service respects user opt-in settings', sinon.test(function () {
		let testAppender = new TestTelemetryAppender();
		let service = new TelemetryService({ userOptIn: false, appender: testAppender }, undefined);

		return service.publicLog('testEvent').then(() => {
			assert.equal(testAppender.getEventsCount(), 0);
			service.dispose();
		});
	}));

	test('Telemetry Service does not sent optInStatus when user opted out', sinon.test(function () {
		let testAppender = new TestTelemetryAppender();
		let service = new TelemetryService({ userOptIn: false, appender: testAppender }, undefined);

		return service.publicLog(optInStatusEventName, { optIn: false }).then(() => {
			assert.equal(testAppender.getEventsCount(), 0);
			service.dispose();
		});
	}));

	test('Telemetry Service sends events when enableTelemetry is on even user optin is on', sinon.test(function () {
		let testAppender = new TestTelemetryAppender();
		let service = new TelemetryService({ userOptIn: true, appender: testAppender }, undefined);

		return service.publicLog('testEvent').then(() => {
			assert.equal(testAppender.getEventsCount(), 1);
			service.dispose();
		});
	}));

	test('Telemetry Service checks with config service', function () {

		let enableTelemetry = false;
		let emitter = new Emitter<any>();

		let testAppender = new TestTelemetryAppender();
		let service = new TelemetryService({
			appender: testAppender
		}, {
				_serviceBrand: undefined,
				getConfiguration() {
					return {
						enableTelemetry: enableTelemetry
					} as any;
				},
				getConfigurationData(): any {
					return null;
				},
				reloadConfiguration() {
					return TPromise.as(this.getConfiguration());
				},
				lookup(key: string) {
					return {
						value: getConfigurationValue(this.getConfiguration(), key),
						default: getConfigurationValue(this.getConfiguration(), key),
						user: getConfigurationValue(this.getConfiguration(), key),
						workspace: null,
						folder: null
					};
				},
				keys() { return { default: [], user: [], workspace: [], folder: [] }; },
				values() { return {}; },
				onDidUpdateConfiguration: emitter.event
			});

		assert.equal(service.isOptedIn, false);

		enableTelemetry = true;
		emitter.fire({});
		assert.equal(service.isOptedIn, true);

		enableTelemetry = false;
		emitter.fire({});
		assert.equal(service.isOptedIn, false);

		service.dispose();
	});
});